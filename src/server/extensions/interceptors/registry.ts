import type { QueryInterceptor, ExtensionMeta, SettingField } from "../../types";
import { pluginsDir } from "../../utils/paths";
import {
  initPlugin,
  loadPluginAssets,
  lockinNameSpace,
  lockinSettingsId,
} from "../../utils/plugin-assets";
import {
  getSettings,
  isDisabled,
  maskSecrets,
  asString,
} from "../../utils/plugin-settings";
import { createRegistry } from "../registry-factory";
import { extensionReadmeExists } from "../../utils/extension-docs";

const SETTINGS_PREFIX = "interceptor-";

const isInterceptor = (val: unknown): val is QueryInterceptor =>
  typeof val === "object" &&
  val !== null &&
  "name" in val &&
  typeof (val as QueryInterceptor).name === "string" &&
  "intercept" in val &&
  typeof (val as QueryInterceptor).intercept === "function";

const registry = createRegistry<QueryInterceptor>({
  dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
  match: (mod) => {
    const i =
      mod.interceptor ??
      (mod.default as Record<string, unknown>)?.interceptor;
    return isInterceptor(i) ? i : null;
  },
  onLoad: async (interceptor, { entryPath, folderName }) => {
    const settingsId = `${SETTINGS_PREFIX}${folderName}`;
    interceptor.settingsId = settingsId;
    const rawSettings = await getSettings(settingsId);
    const p = parseInt(asString(rawSettings["priority"]) || "0", 10);
    interceptor.priority = isNaN(p) ? 0 : p;
    lockinNameSpace(folderName, `interceptors/${settingsId}`);
    lockinSettingsId(folderName, settingsId);
    if (!(await isDisabled(settingsId))) {
      const template = await loadPluginAssets(
        entryPath,
        folderName,
        settingsId,
        "plugin",
      );
      await initPlugin(interceptor, entryPath, settingsId, template);
    }
  },
  debugTag: "interceptors",
});

export const initInterceptors = registry.init;
export const reloadInterceptors = registry.reload;

export const getInterceptors = (): QueryInterceptor[] =>
  registry.items().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

export const getInterceptorBySettingsId = (id: string): QueryInterceptor | null =>
  registry.items().find((i) => i.settingsId === id) ?? null;

export const getInterceptorMeta = async (): Promise<ExtensionMeta[]> => {
  const out: ExtensionMeta[] = [];
  for (const interceptor of registry.items()) {
    const settingsId = interceptor.settingsId;
    if (!settingsId) continue;
    const schema: SettingField[] = interceptor.settingsSchema ?? [];
    const raw = await getSettings(settingsId);
    const settings = maskSecrets(raw, schema);
    if (raw["disabled"]) settings["disabled"] = raw["disabled"];
    const { exists } = await extensionReadmeExists(settingsId);
    out.push({
      id: settingsId,
      displayName: interceptor.name,
      description: interceptor.description,
      type: "interceptor",
      configurable: schema.length > 0,
      settingsSchema: schema,
      settings,
      source: "plugin",
      externalNetworkAccess: interceptor.externalNetworkAccess,
      extensionDocsAvailable: exists,
    });
  }
  return out;
};
