import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { trimTrailingSlash } from "hono/trailing-slash";
import pkg from "../../package.json";
import { getBasePath } from "./utils/base-url";
import { initPlugins } from "./extensions/commands/registry";
import { initUovadipasquas } from "./extensions/uovadipasqua/registry";
import { initEngines } from "./extensions/engines/registry";
import { initMiddlewareRegistry } from "./extensions/middleware/registry";
import { initPluginRoutes } from "./extensions/plugin-routes/registry";
import { initSearchBarActions } from "./extensions/search-bar/registry";
import { initSearchResultTabs } from "./extensions/search-result-tabs/registry";
import { initSlotPlugins } from "./extensions/slots/registry";
import { initThemes } from "./extensions/themes/registry";
import { initTransports } from "./extensions/transports/registry";
import { initAutocomplete } from "./extensions/autocomplete/registry";
import { initInterceptors } from "./extensions/interceptors/registry";
import globalRouter from "./routes";
import { markReady } from "./routes/health";
import { build404 } from "./routes/pages";
import { initServerKey } from "./utils/server-key";
import { initValkey } from "./utils/cache-valkey";
import { getInstanceId } from "./utils/server-settings";
import { runMigrations } from "./migrations";

const BASE_PATH = getBasePath();

const app = new Hono();

app.use(trimTrailingSlash());

app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Referrer-Policy", "no-referrer");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
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
  const locale = c.req
    .header("accept-language")
    ?.split(",")[0]
    ?.split("-")[0]
    ?.trim();
  return c.html(await build404(locale), 404);
});

const port = Number(process.env.DEGOOG_PORT) || 4444;

const _noColor = !!process.env.NO_COLOR;
const _ansi = (code: string): string => (_noColor ? "" : code);
const ANSI_BLUE = _ansi("\x1b[38;2;66;133;244m");
const ANSI_RED = _ansi("\x1b[38;2;234;67;53m");
const ANSI_YELLOW = _ansi("\x1b[38;2;251;188;5m");
const ANSI_GREEN = _ansi("\x1b[38;2;52;168;83m");
const ANSI_RESET = _ansi("\x1b[0m");
const ANSI_GRAY = _ansi("\x1b[90m");

console.log(
  `
   ${ANSI_BLUE}    ░██ ${ANSI_RESET} degoog ${ANSI_GRAY}${pkg.version}
  ${ANSI_BLUE}     ░██ ${ANSI_RESET} Running on ${ANSI_GRAY}http://localhost:${port} ${ANSI_RESET}${"           ".repeat(5)}\n` +
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

Promise.all([
  initServerKey(),
  initTransports(),
  initEngines(),
  initPlugins(),
  initSlotPlugins(),
  initInterceptors(),
  initSearchResultTabs(),
  initSearchBarActions(),
  initPluginRoutes(),
  initMiddlewareRegistry(),
  initThemes(),
  initUovadipasquas(),
  initAutocomplete(),
])
  .then(() => {
    Bun.serve({ port, fetch: app.fetch, idleTimeout: 120 });
    markReady();
  })
  .catch((err) => {
    console.error("[startup] initialization failed", err);
    process.exit(1);
  });
