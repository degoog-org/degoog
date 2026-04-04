import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import {
  initEngines,
  getOutgoingAllowlist,
} from "./extensions/engines/registry";
import { setOutgoingAllowlist } from "./utils/outgoing";
import { initPlugins } from "./extensions/commands/registry";
import { initSlotPlugins } from "./extensions/slots/registry";
import { initSearchResultTabs } from "./extensions/search-result-tabs/registry";
import { initSearchBarActions } from "./extensions/search-bar/registry";
import { initPluginRoutes } from "./extensions/plugin-routes/registry";
import { initMiddlewareRegistry } from "./extensions/middleware/registry";
import { initThemes } from "./extensions/themes/registry";
import { initTransports } from "./extensions/transports/registry";
import pagesRouter from "./routes/pages";
import themesRouter from "./routes/themes";
import searchRouter from "./routes/search";
import commandsRouter from "./routes/commands";
import suggestRouter from "./routes/suggest";
import extensionsRouter from "./routes/extensions";
import settingsAuthRouter from "./routes/settings-auth";
import proxyRouter from "./routes/proxy";
import rateLimitRouter from "./routes/rate-limit";
import pluginAssetsRouter from "./routes/plugin-assets";
import storeRouter from "./routes/store";
import swRouter from "./routes/sw";
import searchBarRouter from "./routes/search-bar";
import pluginRoutesRouter from "./routes/plugin-routes";
import pkg from "../../package.json";

const app = new Hono();

app.use("/public/*.js", async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-cache");
});
app.use("/public/*", serveStatic({ root: "src/" }));
app.route("/", pagesRouter);
app.route("/", searchRouter);
app.route("/", commandsRouter);
app.route("/", suggestRouter);
app.route("/", extensionsRouter);
app.route("/", settingsAuthRouter);
app.route("/", proxyRouter);
app.route("/", rateLimitRouter);
app.route("/", themesRouter);
app.route("/", pluginAssetsRouter);
app.route("/", storeRouter);
app.route("/", swRouter);
app.route("/", searchBarRouter);
app.route("/", pluginRoutesRouter);

const port = Number(process.env.DEGOOG_PORT) || 4444;

Promise.all([
  initTransports(),
  initEngines(),
  initPlugins(),
  initSlotPlugins(),
  initSearchResultTabs(),
  initSearchBarActions(),
  initPluginRoutes(),
  initMiddlewareRegistry(),
  initThemes(),
]).then(() => {
  setOutgoingAllowlist(getOutgoingAllowlist());
  Bun.serve({ port, fetch: app.fetch, idleTimeout: 120 });
  console.log(`degoog v${pkg.version} running on http://localhost:${port}`);
});
