import { type SearchBarAction, type ExtensionMeta, ExtensionStoreType } from "../../types";
import {
  getSettings,
  isDisabled,
  asString,
  maskSecrets,
} from "../../utils/plugin-settings";
import { debug } from "../../utils/logger";

interface StoredAction {
  pluginId: string;
  action: SearchBarAction;
}

let storedActions: StoredAction[] = [];

function isSearchBarAction(val: unknown): val is SearchBarAction {
  if (typeof val !== "object" || val === null) return false;
  const a = val as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    typeof a.label === "string" &&
    typeof a.type === "string" &&
    ["navigate", "bang", "custom"].includes(a.type as string)
  );
}

function isSearchBarActionArray(val: unknown): val is SearchBarAction[] {
  return Array.isArray(val) && val.every(isSearchBarAction);
}

export async function initSearchBarActions(): Promise<void> {
  const { readdir, stat } = await import("fs/promises");
  const { join } = await import("path");
  const { pathToFileURL } = await import("url");
  const { pluginsDir } = await import("../../utils/paths");
  const pluginDir = pluginsDir();
  storedActions = [];

  try {
    const entries = await readdir(pluginDir);
    for (const entry of entries) {
      const entryPath = join(pluginDir, entry);
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
        const actions = mod.searchBarActions ?? mod.default?.searchBarActions;
        if (!isSearchBarActionArray(actions)) continue;
        for (const action of actions) {
          storedActions.push({
            pluginId: entry,
            action: { ...action, id: `${entry}-${action.id}` },
          });
        }
      } catch (err) {
        debug(
          "search-bar",
          `Failed to load search bar actions from plugin: ${entry}`,
          err,
        );
      }
    }
  } catch (err) {
    debug("search-bar", "Failed to read plugin directory", err);
  }
}

export async function getSearchBarActions(): Promise<SearchBarAction[]> {
  const out: SearchBarAction[] = [];
  for (const { pluginId, action } of storedActions) {
    const pluginSettingsId = `plugin-${pluginId}`;
    if (await isDisabled(pluginSettingsId)) continue;
    const settings = await getSettings(pluginSettingsId);
    const label = asString(settings.buttonLabel).trim() || action.label;
    out.push({ ...action, label });
  }
  return out;
}

export async function reloadSearchBarActions(): Promise<void> {
  storedActions = [];
  await initSearchBarActions();
}

export async function getSearchBarActionExtensionMeta(): Promise<
  ExtensionMeta[]
> {
  const out: ExtensionMeta[] = [];
  const seen = new Set<string>();
  for (const { pluginId, action } of storedActions) {
    if (seen.has(pluginId)) continue;
    const schema =
      (
        action as SearchBarAction & {
          settingsSchema?: ExtensionMeta["settingsSchema"];
        }
      ).settingsSchema ?? [];
    if (schema.length === 0) continue;
    seen.add(pluginId);
    const id = `plugin-${pluginId}`;
    const raw = await getSettings(id);
    const settings = maskSecrets(raw, schema);
    if (raw["disabled"]) settings["disabled"] = raw["disabled"];
    const name =
      (action as SearchBarAction & { name?: string }).name ?? pluginId;
    const description =
      (action as SearchBarAction & { description?: string }).description ?? "";
    out.push({
      id,
      displayName: name,
      description,
      type: ExtensionStoreType.Plugin,
      configurable: true,
      settingsSchema: schema,
      settings,
    });
  }
  return out;
}
