import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { LEAKS_ALLOWED_COOKIE } from "../shared/leak-guard";
import { serveStatic, upgradeWebSocket, websocket } from "hono/bun";
import { lstatSync, unlinkSync } from "fs";
import net from "net";
import pkg from "../../package.json";
import { getBasePath } from "./utils/net/base-url";
import { trimSlash } from "./utils/net/trailing-slash";
import { getLocale } from "./utils/hono";
import { initPlugins } from "./extensions/commands/registry";
import { initUovadipasquas } from "./extensions/uovadipasqua/registry";
import { initEngines } from "./extensions/engines/loader";
import { initMiddlewareRegistry } from "./extensions/middleware/registry";
import { initPluginRoutes } from "./extensions/plugin-routes/registry";
import { initSearchBarActions } from "./extensions/search-bar/registry";
import { initSearchResultTabs } from "./extensions/search-result-tabs/registry";
import { initSlotPlugins } from "./extensions/slots/registry";
import { initThemes } from "./extensions/themes/registry";
import { initTransports } from "./extensions/transports/registry";
import { initAutocomplete } from "./extensions/autocomplete/registry";
import { initInterceptors } from "./extensions/interceptors/registry";
import { initShortcutsRegistry } from "./extensions/shortcuts/registry";
import { initFavicon } from "./extensions/favicon/registry";
import globalRouter from "./routes";
import { markReady } from "./routes/health";
import { build404 } from "./routes/pages/pages";
import { initServerKey } from "./utils/security/server-key";
import { logSettingsPasswordStatus } from "./routes/settings/settings-auth";
import { initValkey } from "./utils/cache/cache-valkey";
import { openBifrost } from "./extensions/store/reload-sync";
import { openPalantir } from "./extensions/settings-sync";
import { getInstanceId, getInstanceSettings } from "./utils/settings/server-settings";
import { asBoolean } from "./utils/settings/plugin-settings";
import {
  blockClientLeaksOn,
  contentPolicyHeaders,
  CSP_HEADER,
} from "./utils/security/content-policy";
import { runMigrations } from "./migrations";
import { runFaviconDefaultsMigration093026 } from "./migrations/2026-09-favicon-defaults-migration";
import { startQueue } from "./indexer/queue/queue";
import { logger } from "./utils/logger";
import { drainServer, registerServerHandle } from "./utils/server-lifecycle";
import { getTransportWsHandlers } from "./extensions/transports/ws-registry";
import {
  ANSI_BLUE,
  ANSI_GRAY,
  ANSI_GREEN,
  ANSI_RED,
  ANSI_RESET,
  ANSI_YELLOW,
} from "./utils/ansi";

const BASE_PATH = getBasePath();

const app = new Hono();

app.use(trimSlash());

const NOJS_HEADER_PREFIX = `${BASE_PATH}/nojs`;

app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Referrer-Policy", "no-referrer");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "SAMEORIGIN");
  const path = c.req.path;
  const nojs = path === NOJS_HEADER_PREFIX || path.startsWith(`${NOJS_HEADER_PREFIX}/`);
  if (!nojs && c.res.headers.has(CSP_HEADER)) return;
  const policy = contentPolicyHeaders({
    nojs,
    html: (c.res.headers.get("content-type") ?? "").includes("text/html"),
    blockLeaks: getCookie(c, LEAKS_ALLOWED_COOKIE) !== "1" && (await blockClientLeaksOn()),
  });
  for (const [name, value] of Object.entries(policy)) c.res.headers.set(name, value);
});

app.use(`${BASE_PATH}/public/*.js`, async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
});
app.use(
  `${BASE_PATH}/public/*`,
  serveStatic({
    root: "src/",
    rewriteRequestPath: BASE_PATH
      ? (p) => p.slice(BASE_PATH.length)
      : undefined,
  }),
);
app.route(BASE_PATH || "/", globalRouter);

app.notFound(async (c) => {
  const locale = getLocale(c);
  return c.html(await build404(locale), 404);
});

const bindAddress = process.env.DEGOOG_BIND_ADDRESS?.trim() || "0.0.0.0";
const port = Number(process.env.DEGOOG_PORT) || 4444;
const unixSocket = process.env.DEGOOG_UNIX_SOCKET?.trim();
const displayHost = bindAddress.includes(":") ? `[${bindAddress}]` : bindAddress;
const listenUrl = unixSocket ? `unix:${unixSocket}` : `http://${displayHost == "0.0.0.0" ? "localhost" : displayHost}:${port}`;

const isStaleUnixSocket = async (path: string): Promise<boolean> => {
  try {
    if (!lstatSync(path).isSocket()) return false;
  } catch {
    return false;
  }

  return await new Promise((resolve) => {
    const socket = net.createConnection(path);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", (err: NodeJS.ErrnoException) => resolve(err.code === "ECONNREFUSED"));
  });
};

const bindUnixSocket = async (path: string, serve: () => void): Promise<void> => {
  try {
    serve();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE" || !(await isStaleUnixSocket(path))) throw err;
    logger.warn(`[startup] removing stale unix socket at ${path}`);
    unlinkSync(path);
    serve();
  }
};

const PORT_BIND_RETRY_ATTEMPTS = 10;
const PORT_BIND_RETRY_DELAY_MS = 300;

const bindPort = async (serve: () => void): Promise<void> => {
  for (let attempt = 1; attempt <= PORT_BIND_RETRY_ATTEMPTS; attempt++) {
    try {
      serve();
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE" || attempt === PORT_BIND_RETRY_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, PORT_BIND_RETRY_DELAY_MS));
    }
  }
};

console.log(
  `
   ${ANSI_BLUE}    ░██ ${ANSI_RESET} degoog ${ANSI_GRAY}${pkg.version}
  ${ANSI_BLUE}     ░██ ${ANSI_RESET} Running on ${ANSI_GRAY}${listenUrl} ${ANSI_RESET}${"           ".repeat(5)}\n` +
  `${ANSI_BLUE}       ░██ ${ANSI_RESET}${"           ".repeat(5)}\n` +
  `${ANSI_BLUE} ░████████ ${ANSI_RED} ░███████  ${ANSI_YELLOW} ░████████ ${ANSI_BLUE} ░███████  ${ANSI_GREEN} ░███████  ${ANSI_RED} ░████████ ${ANSI_RESET}\n` +
  `${ANSI_BLUE}░██    ░██ ${ANSI_RED}░██    ░██ ${ANSI_YELLOW}░██    ░██ ${ANSI_BLUE}░██    ░██ ${ANSI_GREEN}░██    ░██ ${ANSI_RED}░██    ░██ ${ANSI_RESET}\n` +
  `${ANSI_BLUE}░██    ░██ ${ANSI_RED}░█████████ ${ANSI_YELLOW}░██    ░██ ${ANSI_BLUE}░██    ░██ ${ANSI_GREEN}░██    ░██ ${ANSI_RED}░██    ░██ ${ANSI_RESET}\n` +
  `${ANSI_BLUE}░██    ░██ ${ANSI_RED}░██        ${ANSI_YELLOW}░██    ░██ ${ANSI_BLUE}░██    ░██ ${ANSI_GREEN}░██    ░██ ${ANSI_RED}░██    ░██ ${ANSI_RESET}\n` +
  `${ANSI_BLUE} ░████████ ${ANSI_RED} ░███████  ${ANSI_YELLOW} ░████████ ${ANSI_BLUE} ░███████  ${ANSI_GREEN} ░███████  ${ANSI_RED} ░████████ ${ANSI_RESET}\n` +
  `${"           ".repeat(2)}${ANSI_YELLOW}       ░██ ${ANSI_RESET}${"           ".repeat(2)}${ANSI_RED}       ░██ ${ANSI_RESET}\n` +
  `${"           ".repeat(2)}${ANSI_YELLOW} ░███████  ${ANSI_RESET}${"           ".repeat(2)}${ANSI_RED} ░███████  ${ANSI_RESET}

${ANSI_GRAY}█████████████████████████████████████████████████████████████████${ANSI_RESET}
 `,
);

await runMigrations();
await initValkey(await getInstanceId());
openBifrost();
openPalantir();

const initExtensionRegistries = async (): Promise<void> => {
  await Promise.all([
    initTransports(),
    initEngines(),
    initSlotPlugins(),
    initInterceptors(),
    initSearchResultTabs(),
    initSearchBarActions(),
    initMiddlewareRegistry(),
    initThemes(),
    initUovadipasquas(),
    initAutocomplete(),
    initShortcutsRegistry(),
    initFavicon(),
  ]);

  /**
   * @fccview here, if you are wondering why these are loaded outside of that big
   * Promise.all it's because the plugin api routes MUST be initialised after the plugins are loaded
   * and promise.all is not gonna give a reliable order of execution 100% of the time.
   * 
   * This ensures your lovely extremely dangerous api routes from third party plugins you are installing
   * from dubious sources that you are MOST DEFINITELY NOT code checking are running nicely in the background 
   * and installing all sort of viruses and exploits reliably <3 happy farwesting!
   */
  await initPlugins();
  await initPluginRoutes();
};

const shutdown = (signal: string): void => {
  logger.info("server", `received ${signal}, shutting down`);
  void drainServer().then(() => process.exit(0));
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

Promise.all([initServerKey(), initExtensionRegistries()])
  .then(async () => {
    const settings = await getInstanceSettings();
    if (asBoolean(settings.degoogIndexerEnabled))
      await startQueue().catch((err) =>
        logger.error("indexer", "queue start failed", err),
      );

    for (const [name] of getTransportWsHandlers()) {
      app.get(`/ws/${name}/:password?`, upgradeWebSocket((c) => {
        const transportName = name;
        const passwordPath = `/${c.req.param("password") ?? ""}`;
        const handlers = getTransportWsHandlers().get(transportName);
        if (handlers?.onUpgrade?.(passwordPath) === false) {
          return {
            onOpen(_evt, ws) { ws.close(1008, "unauthorized"); },
            onMessage() { },
            onClose() { },
          };
        }
        return {
          onOpen(_evt, ws) {
            getTransportWsHandlers().get(transportName)?.onOpen(ws);
          },
          onMessage(evt, ws) {
            const raw = typeof evt.data === "string" ? evt.data : String(evt.data);
            getTransportWsHandlers().get(transportName)?.onMessage(ws, raw);
          },
          onClose(_evt, ws) {
            getTransportWsHandlers().get(transportName)?.onClose(ws);
          },
        };
      }));
    }

    if (unixSocket) {
      await bindUnixSocket(unixSocket, () =>
        registerServerHandle(Bun.serve({ unix: unixSocket, fetch: app.fetch, websocket })),
      );
    } else {
      await bindPort(() =>
        registerServerHandle(Bun.serve({ hostname: bindAddress, port, fetch: app.fetch, websocket, idleTimeout: 120 })),
      );
    }
    markReady();
    void runFaviconDefaultsMigration093026();

    logSettingsPasswordStatus();
  })
  .catch((err) => {
    console.error("[startup] initialization failed", err);
    process.exit(1);
  });
