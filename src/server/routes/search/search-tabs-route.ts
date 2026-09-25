import type { Hono } from "hono";
import { listSearchTabs } from "../../search/tab-list";

export function registerSearchTabsRoutes(router: Hono): void {
  router.get("/api/search-tabs", async (c) => {
    return c.json({ tabs: await listSearchTabs() });
  });
}
