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

interface PluginActions {
  pluginId: string;
  actions: SearchBarAction[];
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

const registry = createRegistry<PluginActions>({
  dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
  match: (mod) => {
    const actions =
      mod.searchBarActions ??
      (mod.default as Record<string, unknown>)?.searchBarActions;
    return isSearchBarActionArray(actions) ? { pluginId: "", actions } : null;
  },
  onLoad: async (item, { entryPath, folderName }) => {
    const t = await createTranslatorFromPath(entryPath);
    item.pluginId = folderName;
    item.actions = item.actions.map((action) => ({
      ...action,
      id: `${folderName}-${action.id}`,
      t,
    }));
  },
  debugTag: "search-bar",
});

export async function initSearchBarActions(): Promise<void> {
  await registry.init();
}

export async function getSearchBarActions(): Promise<SearchBarAction[]> {
  const out: SearchBarAction[] = [];
  for (const { pluginId, actions } of registry.items()) {
    const pluginSettingsId = `plugin-${pluginId}`;
    if (await isDisabled(pluginSettingsId)) continue;
    const settings = await getSettings(pluginSettingsId);
    for (const action of actions) {
      const label = asString(settings.buttonLabel).trim() || action.label;
      out.push({ ...action, label });
    }
  }
  return out;
}

export async function reloadSearchBarActions(): Promise<void> {
  await registry.init();
}

export async function getSearchBarActionExtensionMeta(): Promise<
  ExtensionMeta[]
> {
  const out: ExtensionMeta[] = [];
  for (const { pluginId, actions } of registry.items()) {
    if (actions.length === 0) continue;
    const action = actions[0];
    const schema =
      (
        action as SearchBarAction & {
          settingsSchema?: ExtensionMeta["settingsSchema"];
        }
      ).settingsSchema ?? [];
    if (schema.length === 0) continue;
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
  return registry
    .items()
    .filter(({ actions }) => !!actions[0]?.t)
    .map(({ pluginId, actions }) => ({
      namespace: `search-bar/${pluginId}`,
      translator: actions[0].t!,
    }));
}
