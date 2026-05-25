import type { SearchResultTab, Translate } from "../../types";
import {
  initPlugin,
  loadPluginAssets,
  lockinNameSpace,
  lockinSettingsId,
} from "../../utils/plugin-assets";
import { isDisabled } from "../../utils/plugin-settings";
import { bootCircuitFromPath } from "../../utils/translation-circuit";
import { pluginsDir } from "../../utils/paths";
import { createRegistry } from "../registry-factory";

function isSearchResultTab(val: unknown): val is SearchResultTab {
  if (typeof val !== "object" || val === null) return false;
  const t = val as SearchResultTab;
  if (typeof t.name !== "string") return false;
  const hasExecute = typeof t.executeSearch === "function";
  const hasEngineType =
    typeof t.engineType === "string" && t.engineType.trim() !== "";
  return hasExecute || hasEngineType;
}

const registry = createRegistry<SearchResultTab>({
  dirs: () => [{ dir: pluginsDir() }],
  match: (mod) => {
    const t =
      mod.tab ??
      mod.searchResultTab ??
      (mod.default as Record<string, unknown>)?.tab;
    return isSearchResultTab(t) ? t : null;
  },
  canonicalIdKind: "tab",
  onLoad: async (tab, { entryPath, folderName, canonicalId }) => {
    const id = canonicalId ?? folderName;
    tab.id = id;
    tab.settingsId = id;
    tab.t = await bootCircuitFromPath(entryPath);
    lockinNameSpace(folderName, `tabs/${id}`);
    lockinSettingsId(folderName, id);
    if (!(await isDisabled(id))) {
      const template = await loadPluginAssets(entryPath, folderName, id);
      await initPlugin(tab, entryPath, id, template, { pluginId: folderName });
    }
  },
  debugTag: "search-result-tabs",
});

export async function initSearchResultTabs(): Promise<void> {
  await registry.init();
}

export function getSearchResultTabs(): SearchResultTab[] {
  return registry.items();
}

export function getSearchResultTabById(tabId: string): SearchResultTab | null {
  return registry.items().find((t) => t.id === tabId) ?? null;
}

export async function reloadSearchResultTabs(bust = true): Promise<void> {
  await (bust ? registry.reload() : registry.refresh());
}

export function getAllTabTranslators(): {
  namespace: string;
  translator: Translate;
}[] {
  return registry
    .items()
    .filter((t) => !!t.t)
    .map((t) => ({ namespace: `tabs/${t.id}`, translator: t.t! }));
}
