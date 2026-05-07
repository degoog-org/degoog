import type { RequestMiddleware, Translate } from "../../types";
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

function isRequestMiddleware(val: unknown): val is RequestMiddleware {
  if (typeof val !== "object" || val === null) return false;
  const m = val as Record<string, unknown>;
  return typeof m.name === "string" && typeof m.handle === "function";
}

const _legacyToCanonical = new Map<string, string>();

const registry = createRegistry<RequestMiddleware>({
  dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
  match: (mod) => {
    const m =
      mod.middleware ?? (mod.default as Record<string, unknown>)?.middleware;
    return isRequestMiddleware(m) ? m : null;
  },
  canonicalIdKind: "middleware",
  onLoad: async (m, { entryPath, folderName, source, canonicalId }) => {
    const legacyId = typeof m.id === "string" ? m.id : "";
    const id = canonicalId ?? folderName;
    m.id = id;
    const { settingsId, fallbackSettingsIds } = stupidSettingIDtoAvoidConflicts(
      {
        kind: "middleware",
        canonicalId: id,
        folderName,
        legacyDevId: legacyId,
        explicitSettingsId: m.settingsId,
      },
    );
    m.settingsId = settingsId;
    m.settingsFallbackIds = fallbackSettingsIds;
    if (legacyId && legacyId !== id) _legacyToCanonical.set(legacyId, id);
    m.t = await createTranslatorFromPath(entryPath);
    lockinNameSpace(folderName, `middleware/${id}`);
    lockinSettingsId(folderName, settingsId);
    if (!(await isDisabledWithFallback(settingsId, fallbackSettingsIds))) {
      const template = await loadPluginAssets(
        entryPath,
        folderName,
        settingsId,
        source,
      );
      await initPlugin(m, entryPath, settingsId, template, fallbackSettingsIds);
    }
  },
  debugTag: "middleware",
});

export async function initMiddlewareRegistry(): Promise<void> {
  _legacyToCanonical.clear();
  await registry.init();
}

export function getMiddleware(id: string): RequestMiddleware | null {
  const direct = registry.items().find((m) => m.id === id);
  if (direct) return direct;
  const mapped = _legacyToCanonical.get(id);
  if (!mapped) return null;
  return registry.items().find((m) => m.id === mapped) ?? null;
}

export async function reloadMiddlewareRegistry(): Promise<void> {
  _legacyToCanonical.clear();
  await registry.reload();
}

export function getAllMiddlewareTranslators(): {
  namespace: string;
  translator: Translate;
}[] {
  return registry
    .items()
    .filter((m) => !!m.t)
    .map((m) => ({ namespace: `middleware/${m.id}`, translator: m.t! }));
}
