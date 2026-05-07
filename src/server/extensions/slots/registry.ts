import { join } from "path";
import {
  SlotPanelPosition,
  type SlotPlugin,
  type Translate,
} from "../../types";
import { pluginsDir } from "../../utils/paths";
import {
  initPlugin,
  loadPluginAssets,
  lockinNameSpace,
  lockinSettingsId,
} from "../../utils/plugin-assets";
import { isDisabledWithFallback } from "../../utils/plugin-settings";
import { createTranslatorFromPath } from "../../utils/translation";
import { createRegistry } from "../registry-factory";
import { stupidSettingIDtoAvoidConflicts } from "../extension-id";

const builtinsDir = join(
  process.cwd(),
  "src",
  "server",
  "extensions",
  "commands",
  "builtins",
);

function isSlotPlugin(val: unknown): val is SlotPlugin {
  if (typeof val !== "object" || val === null) return false;
  const slot = val as SlotPlugin;
  const validPositions = new Set(Object.values(SlotPanelPosition));
  const positionOk =
    "position" in slot &&
    validPositions.has(slot.position as SlotPanelPosition);
  const slotPositionsOk =
    !("slotPositions" in slot) ||
    (Array.isArray(slot.slotPositions) &&
      slot.slotPositions.length > 0 &&
      slot.slotPositions.every((p) => validPositions.has(p)));
  return (
    "name" in slot &&
    typeof slot.name === "string" &&
    positionOk &&
    slotPositionsOk &&
    "trigger" in slot &&
    typeof slot.trigger === "function" &&
    "execute" in slot &&
    typeof slot.execute === "function"
  );
}

const slotSourceMap = new Map<string, "builtin" | "plugin">();

const registry = createRegistry<SlotPlugin>({
  dirs: () => [
    { dir: builtinsDir, source: "builtin" },
    { dir: pluginsDir(), source: "plugin" },
  ],
  match: (mod) => {
    const s =
      mod.slot ??
      mod.slotPlugin ??
      (mod.default as Record<string, unknown>)?.slot;
    return isSlotPlugin(s) ? s : null;
  },
  canonicalIdKind: "slot",
  onLoad: async (slot, { entryPath, folderName, source, canonicalId }) => {
    const legacyId = typeof slot.id === "string" ? slot.id : "";
    const id = canonicalId ?? folderName;
    slot.id = id;

    const { settingsId, fallbackSettingsIds } = stupidSettingIDtoAvoidConflicts(
      {
        kind: "slot",
        canonicalId: id,
        folderName,
        legacyDevId: legacyId,
        explicitSettingsId: slot.settingsId,
      },
    );

    slot.settingsId = settingsId;
    slot.settingsFallbackIds = fallbackSettingsIds;
    slotSourceMap.set(id, source);
    slot.t = await createTranslatorFromPath(entryPath);

    lockinNameSpace(folderName, `slots/${id}`);
    lockinSettingsId(folderName, settingsId);

    if (!(await isDisabledWithFallback(settingsId, fallbackSettingsIds))) {
      const template = await loadPluginAssets(
        entryPath,
        folderName,
        settingsId,
        source,
      );

      await initPlugin(
        slot,
        entryPath,
        settingsId,
        template,
        fallbackSettingsIds,
      );
    }
  },
  debugTag: "slots",
});

export async function initSlotPlugins(): Promise<void> {
  slotSourceMap.clear();
  await registry.init();
}

export function getSlotSource(slotId: string): "builtin" | "plugin" {
  return slotSourceMap.get(slotId) ?? "plugin";
}

export function getSlotPlugins(): SlotPlugin[] {
  return registry.items();
}

export function getSlotPluginById(slotId: string): SlotPlugin | null {
  return registry.items().find((p) => p.id === slotId) ?? null;
}

export function getAllSlotTranslators(): {
  namespace: string;
  translator: Translate;
}[] {
  return registry
    .items()
    .filter((s) => !!s.t)
    .map((s) => ({ namespace: `slots/${s.id}`, translator: s.t! }));
}

export async function reloadSlotPlugins(): Promise<void> {
  slotSourceMap.clear();
  await registry.reload();
}
