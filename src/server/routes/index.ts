import { Hono } from "hono";

import { cssCheckOn, isBlocked } from "../utils/security/bot-trap";
import { hasPinged, strike } from "../utils/security/link-token";
import { getClientIp } from "../utils/net/request";
import { getLocale } from "../utils/hono";
import commands from "./extensions/commands";
import health from "./health";
import honeypot from "./security/honeypot";
import pages, { buildGandalf } from "./pages/pages";
import teapot from "./easter-eggs/teapot";
import uovadipasqua from "./easter-eggs/uovadipasqua";
import extensions from "./extensions/extensions";
import indexer from "./indexer";
import nojs from "../nojs/router";
import pluginAssets from "./extensions/plugin-assets";
import pluginRoutes from "./extensions/plugin-routes";
import proxy from "./proxy";
import rateLimit from "./security/rate-limit";
import search from "./search";
import searchBar from "./search/search-bar";
import searchStream from "./search/stream";
import searxEngines from "./extensions/searx-engines";
import compatEngines from "./extensions/compat-engines";
import setup from "./settings/setup";
import settings from "./settings/settings";
import settingsAuth from "./settings/settings-auth";
import settingsBackup from "./settings/settings-backup";
import shortcuts from "./extensions/shortcuts";
import slots from "./search/slots";
import store from "./extensions/store";
import suggest from "./search/suggest";
import sw from "./sw";
import themes from "./extensions/themes";

const globalRouter = new Hono();

globalRouter.route("/", health);

// TODO Consider using a more structured approach for the routes
// e.g. globalRouter.route("/", commands); becomes globalRouter.route("/commands/", commands);
// needs a full refactor of the client-side code to match the new API endpoints, but it would be more maintainable and scalable in the long run

globalRouter.use("*", async (c, next) => {
  const ip = getClientIp(c);
  if (ip && (await isBlocked(ip))) {
    const locale = getLocale(c);
    return c.html(await buildGandalf(locale), 403);
  }
  if (
    ip &&
    (await cssCheckOn()) &&
    c.req.path === "/search" &&
    c.req.query("q") &&
    !hasPinged(ip)
  ) {
    await strike(ip);
  }
  return next();
});

globalRouter.route("/", setup);
globalRouter.route("/", honeypot);
globalRouter.route("/", commands);
globalRouter.route("/", uovadipasqua);
globalRouter.route("/", extensions);
globalRouter.route("/", indexer);
globalRouter.route("/", nojs);
globalRouter.route("/", pages);
globalRouter.route("/", teapot);
globalRouter.route("/", pluginAssets);
globalRouter.route("/", pluginRoutes);
globalRouter.route("/", proxy);
globalRouter.route("/", rateLimit);
globalRouter.route("/", search);
globalRouter.route("/", searchBar);
globalRouter.route("/", searchStream);
globalRouter.route("/", searxEngines);
globalRouter.route("/", compatEngines);
globalRouter.route("/", settings);
globalRouter.route("/", settingsAuth);
globalRouter.route("/", settingsBackup);
globalRouter.route("/", shortcuts);
globalRouter.route("/", slots);
globalRouter.route("/", store);
globalRouter.route("/", suggest);
globalRouter.route("/", sw);
globalRouter.route("/", themes);

export default globalRouter;
