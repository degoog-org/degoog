import type { Hono } from "hono";
import { getCustomEngineTypes } from "../../extensions/engines/registry";
import { getSearchResultTabs } from "../../extensions/search-result-tabs/registry";
import { isDisabledWithFallback } from "../../utils/plugin-settings";
import { logger } from "../../utils/logger";

export function registerSearchTabsRoutes(router: Hono): void {
  router.get("/api/search-tabs", async (c) => {
    const seen = new Set<string>();
    const list: { id: string; name: string; icon: string | null }[] = [];

    for (const engineType of getCustomEngineTypes()) {
      seen.add(engineType);
      list.push({
        id: `engine:${engineType}`,
        name: engineType.charAt(0).toUpperCase() + engineType.slice(1),
        icon: null,
      });
    }

    const tabs = getSearchResultTabs();
    for (const tab of tabs) {
      if (!tab.id) {
        logger.warn(
          "search-tabs",
          `Skipping tab: missing id (name="${tab.name}")`,
        );
        continue;
      }
      if (tab.engineType && seen.has(tab.engineType)) {
        const existing = list.find((t) => t.id === `engine:${tab.engineType}`);
        if (existing) {
          existing.name = tab.name;
          existing.icon = tab.icon ?? null;
          existing.id = tab.id;
        }
        continue;
      }
      const settingsId = tab.settingsId ?? `tab-${tab.id}`;
      const fallbacks = tab.settingsFallbackIds ?? [];
      if (await isDisabledWithFallback(settingsId, fallbacks)) continue;
      list.push({ id: tab.id, name: tab.name, icon: tab.icon ?? null });
    }
    return c.json({ tabs: list });
  });
}
