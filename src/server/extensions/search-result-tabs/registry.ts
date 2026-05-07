import type { SearchResultTab, Translate } from "../../types";
import {
  initPlugin,
  loadPluginAssets,
  lockinNameSpace,
  lockinSettingsId,
} from "../../utils/plugin-assets";
import { isDisabledWithFallback } from "../../utils/plugin-settings";
import { createTranslatorFromPath } from "../../utils/translation";
import { pluginsDir } from "../../utils/paths";
import { createRegistry } from "../registry-factory";
import { stupidSettingIDtoAvoidConflicts } from "../extension-id";

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
  dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
  match: (mod) => {
    const t =
      mod.tab ??
      mod.searchResultTab ??
      (mod.default as Record<string, unknown>)?.tab;
    return isSearchResultTab(t) ? t : null;
  },
  canonicalIdKind: "tab",
  onLoad: async (tab, { entryPath, folderName, source, canonicalId }) => {
    const legacyId = typeof tab.id === "string" ? tab.id : "";
    const id = canonicalId ?? folderName;
    tab.id = id;
    const { settingsId, fallbackSettingsIds } = stupidSettingIDtoAvoidConflicts(
      {
        kind: "tab",
        canonicalId: id,
        folderName,
        legacyDevId: legacyId,
        explicitSettingsId: tab.settingsId,
      },
    );
    tab.settingsId = settingsId;
    tab.settingsFallbackIds = fallbackSettingsIds;
    tab.t = await createTranslatorFromPath(entryPath);
    lockinNameSpace(folderName, `tabs/${id}`);
    lockinSettingsId(folderName, settingsId);
    if (!(await isDisabledWithFallback(settingsId, fallbackSettingsIds))) {
      const template = await loadPluginAssets(
        entryPath,
        folderName,
        settingsId,
        source,
      );
      await initPlugin(
        tab,
        entryPath,
        settingsId,
        template,
        fallbackSettingsIds,
      );
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

export async function reloadSearchResultTabs(): Promise<void> {
  await registry.reload();
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
