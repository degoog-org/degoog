import { Hono } from "hono";
import { registerLuckyRoute } from "./lucky-route";
import { registerSearchRoutes } from "./search-routes";
import { registerSearchTabsRoutes } from "./search-tabs-route";
import { registerTabSearchRoute } from "./tab-search-route";

const router = new Hono();

registerSearchRoutes(router);
registerLuckyRoute(router);
registerSearchTabsRoutes(router);
registerTabSearchRoute(router);

export default router;
