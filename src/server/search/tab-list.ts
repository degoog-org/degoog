import { getCustomEngineTypes } from "../extensions/engines/catalog";
import { getSearchResultTabs } from "../extensions/search-result-tabs/registry";
import { isDisabled } from "../utils/settings/plugin-settings";
import { logger } from "../utils/logger";

export interface SearchTabEntry {
  id: string;
  name: string;
  icon: string | null;
}

export async function listSearchTabs(): Promise<SearchTabEntry[]> {
  const seen = new Set<string>();
  const seenLower = new Set<string>();
  const list: SearchTabEntry[] = [];

  for (const engineType of await getCustomEngineTypes()) {
    const lower = engineType.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    seen.add(lower);
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
    const settingsId = tab.settingsId ?? tab.id;
    if (await isDisabled(settingsId)) continue;
    const engineType = tab.engineType?.toLowerCase();
    if (engineType && seen.has(engineType)) {
      const existing = list.find(
        (t) => t.id.toLowerCase() === `engine:${engineType}`,
      );
      if (existing) {
        existing.name = tab.name;
        existing.icon = tab.icon ?? null;
        existing.id = tab.id;
      }
      continue;
    }
    list.push({ id: tab.id, name: tab.name, icon: tab.icon ?? null });
  }

  return list;
}
