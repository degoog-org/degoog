import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { initEngines } from "./engines/registry";
import { initPlugins } from "./commands/registry";
import { initSlotPlugins } from "./slots/registry";
import { initThemes } from "./themes/registry";
import pagesRouter from "./routes/pages";
import themesRouter from "./routes/themes";
import searchRouter from "./routes/search";
import commandsRouter from "./routes/commands";
import suggestRouter from "./routes/suggest";
import extensionsRouter from "./routes/extensions";
import settingsAuthRouter from "./routes/settings-auth";
import proxyRouter from "./routes/proxy";
import pkg from "../package.json";

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
app.route("/", themesRouter);

const port = Number(process.env.DEGOOG_PORT) || 4444;

Promise.all([initEngines(), initPlugins(), initSlotPlugins(), initThemes()]).then(() => {
  Bun.serve({ port, fetch: app.fetch });
  console.log(`degoog v${pkg.version} running on http://localhost:${port}`);
});
