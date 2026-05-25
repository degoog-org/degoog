import type { RequestMiddleware, Translate } from "../../types";
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

const isRequestMiddleware = (val: unknown): val is RequestMiddleware => {
  if (typeof val !== "object" || val === null) return false;
  const m = val as Record<string, unknown>;
  return typeof m.name === "string" && typeof m.handle === "function";
};

const registry = createRegistry<RequestMiddleware>({
  dirs: () => [{ dir: pluginsDir() }],
  match: (mod) => {
    const m =
      mod.middleware ?? (mod.default as Record<string, unknown>)?.middleware;
    return isRequestMiddleware(m) ? m : null;
  },
  canonicalIdKind: "middleware",
  onLoad: async (m, { entryPath, folderName, canonicalId }) => {
    const id = canonicalId ?? folderName;
    m.id = id;
    m.settingsId = id;
    m.t = await bootCircuitFromPath(entryPath);
    lockinNameSpace(folderName, `middleware/${id}`);
    lockinSettingsId(folderName, id);
    if (!(await isDisabled(id))) {
      const template = await loadPluginAssets(entryPath, folderName, id);
      await initPlugin(m, entryPath, id, template, { pluginId: folderName });
    }
  },
  debugTag: "middleware",
});

export const initMiddlewareRegistry = async (): Promise<void> => {
  await registry.init();
};

export const getMiddleware = (id: string): RequestMiddleware | null =>
  registry.items().find((m) => m.id === id) ?? null;

export const reloadMiddlewareRegistry = async (bust = true): Promise<void> => {
  await (bust ? registry.reload() : registry.refresh());
};

export const getAllMiddlewareTranslators = (): {
  namespace: string;
  translator: Translate;
}[] =>
  registry
    .items()
    .filter((m) => !!m.t)
    .map((m) => ({ namespace: `middleware/${m.id}`, translator: m.t! }));
