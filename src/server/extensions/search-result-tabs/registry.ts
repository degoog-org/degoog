import { join } from "path";
import type { SearchResultTab, PluginContext } from "../../types";
import { getSettings } from "../../plugin-settings";
import { addPluginCss, registerPluginScript, registerPluginSettingsId } from "../../plugin-assets";
import { debug } from "../../logger";

let tabPlugins: SearchResultTab[] = [];

function isSearchResultTab(val: unknown): val is SearchResultTab {
  if (typeof val !== "object" || val === null) return false;
  const t = val as SearchResultTab;
  if (typeof t.id !== "string" || typeof t.name !== "string") return false;
  const hasExecute = typeof t.executeSearch === "function";
  const hasEngineType = typeof t.engineType === "string" && t.engineType.trim() !== "";
  return hasExecute || hasEngineType;
}

async function loadTabsFromRoot(rootDir: string, source: "plugin" | "builtin"): Promise<void> {
  const { readdir, readFile, stat } = await import("fs/promises");
  const { pathToFileURL } = await import("url");
  let entries: string[];
  try {
    entries = await readdir(rootDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryPath = join(rootDir, entry);
    const entryStat = await stat(entryPath).catch(() => null);
    if (!entryStat?.isDirectory()) continue;

    let indexFile: string | undefined;
    for (const f of ["index.js", "index.ts", "index.mjs", "index.cjs"]) {
      const s = await stat(join(entryPath, f)).catch(() => null);
      if (s?.isFile()) {
        indexFile = f;
        break;
      }
    }
    if (!indexFile) continue;

    try {
      const fullPath = join(entryPath, indexFile);
      const url = pathToFileURL(fullPath).href;
      const mod = await import(url);
      const tab = mod.tab ?? mod.searchResultTab ?? mod.default?.tab;
      if (!tab || !isSearchResultTab(tab)) continue;

      const tabSettingsId = tab.settingsId ?? `tab-${tab.id}`;
      const template = await readFile(join(entryPath, "template.html"), "utf-8").catch(() => "");
      const css = await readFile(join(entryPath, "style.css"), "utf-8").catch(() => "");
      if (css) addPluginCss(tabSettingsId, css);
      const hasScript = await stat(join(entryPath, "script.js")).catch(() => null);
      if (hasScript?.isFile()) registerPluginScript(entry, source, tabSettingsId);
      registerPluginSettingsId(entry, tabSettingsId);

      if (tab.init) {
        const ctx: PluginContext = {
          dir: entryPath,
          template,
          readFile: (filename: string) => readFile(join(entryPath, filename), "utf-8"),
        };
        await Promise.resolve(tab.init(ctx));
      }

      if (tab.settingsSchema?.length && tab.configure) {
        try {
          const stored = await getSettings(tabSettingsId);
          if (Object.keys(stored).length > 0) tab.configure(stored);
        } catch (err) {
          debug("search-result-tabs", `Failed to configure tab plugin: ${tab.id}`, err);
        }
      }
      tabPlugins.push(tab);
    } catch (err) {
      debug("search-result-tabs", `Failed to load tab plugin: ${entry}`, err);
    }
  }
}

export async function initSearchResultTabs(): Promise<void> {
  const pluginDir = process.env.DEGOOG_PLUGINS_DIR ?? join(process.cwd(), "data", "plugins");
  tabPlugins = [];
  await loadTabsFromRoot(pluginDir, "plugin");
}

export function getSearchResultTabs(): SearchResultTab[] {
  return [...tabPlugins];
}

export function getSearchResultTabById(tabId: string): SearchResultTab | null {
  return tabPlugins.find((t) => t.id === tabId) ?? null;
}

export async function reloadSearchResultTabs(): Promise<void> {
  tabPlugins = [];
  await initSearchResultTabs();
}
