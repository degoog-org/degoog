import {
  type ExtensionMeta,
  ExtensionStoreType,
  type SearchBarAction,
  type Translate,
} from "../../types";
import {
  asString,
  getSettings,
  isDisabled,
  maskSecrets,
} from "../../utils/plugin-settings";
import { createTranslatorFromPath } from "../../utils/translation";
import { pluginsDir } from "../../utils/paths";
import { createRegistry } from "../registry-factory";

interface StoredAction {
  pluginId: string;
  action: SearchBarAction;
}

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

let storedActions: StoredAction[] = [];

const registry = createRegistry<SearchBarAction[]>({
  dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
  match: (mod) => {
    const actions =
      mod.searchBarActions ??
      (mod.default as Record<string, unknown>)?.searchBarActions;
    return isSearchBarActionArray(actions) ? actions : null;
  },
  onLoad: async (actions, { entryPath, folderName }) => {
    const t = await createTranslatorFromPath(entryPath);
    for (const action of actions) {
      action.t = t;
      storedActions.push({
        pluginId: folderName,
        action: { ...action, id: `${folderName}-${action.id}` },
      });
    }
  },
  debugTag: "search-bar",
});

export async function initSearchBarActions(): Promise<void> {
  storedActions = [];
  await registry.init();
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
  await registry.init();
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

export function getAllSearchBarTranslators(): {
  namespace: string;
  translator: Translate;
}[] {
  const seen = new Map<string, Translate>();
  for (const { pluginId, action } of storedActions) {
    if (!action.t || seen.has(pluginId)) continue;
    seen.set(pluginId, action.t);
  }
  return Array.from(seen.entries()).map(([id, translator]) => ({
    namespace: `search-bar/${id}`,
    translator,
  }));
}
