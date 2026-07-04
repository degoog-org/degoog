import { join } from "path";
import {
  ExtensionStoreType,
  SlotPanelPosition,
  SLOT_POSITION_SETTING_KEY,
  type ExtensionMeta,
  type SettingField,
  type SlotPlugin,
  type Translate,
} from "../../types";
import { logger } from "../../utils/logger";
import { pluginsDir } from "../../utils/paths";
import {
  initPlugin,
  loadPluginAssets,
  lockinNameSpace,
  lockinSettingsId,
} from "../../utils/plugin-assets";
import { getSettings, isDisabled, maskSecrets } from "../../utils/plugin-settings";
import { bootCircuitFromPath } from "../../utils/translation-circuit";
import { createRegistry } from "../registry-factory";
import { getInterceptors } from "../interceptors/registry";
import { isPluginManifest } from "../plugin-manifest";
import { isExtensionRestartFlagVisible } from "../../utils/restart-state";

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
  dirs: () => [{ dir: builtinsDir, source: "builtin" }, { dir: pluginsDir() }],
  match: (mod) => {
    const s =
      mod.slot ??
      mod.slotPlugin ??
      (mod.default as Record<string, unknown>)?.slot;
    if (!isSlotPlugin(s)) return null;
    if (isPluginManifest(mod.plugin)) s.pluginManifest = mod.plugin;
    return s;
  },
  canonicalIdKind: "slot",
  onLoad: async (slot, { entryPath, folderName, source, canonicalId }) => {
    const id = slot.pluginManifest?.id ?? canonicalId ?? folderName;
    slot.id = id;
    slot.settingsId = id;
    const rawSettings = await getSettings(id);
    const p = parseInt(String(rawSettings["priority"] ?? "0"), 10);
    slot.priority = isNaN(p) ? 0 : p;
    slotSourceMap.set(id, source);
    slot.t = await bootCircuitFromPath(entryPath);

    lockinNameSpace(folderName, `slots/${id}`);
    lockinSettingsId(folderName, id);

    if (!(await isDisabled(id))) {
      const template = await loadPluginAssets(
        entryPath,
        folderName,
        id,
        source,
      );
      await initPlugin(slot, entryPath, id, template, { pluginId: folderName });
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
  return registry.items().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
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

export async function reloadSlotPlugins(bust = true): Promise<void> {
  slotSourceMap.clear();
  await (bust ? registry.reload() : registry.refresh());
}

export const getSlotExtensionMeta = async (
  coreT?: Translate,
): Promise<ExtensionMeta[]> => {
  const slots = getSlotPlugins();
  const out: ExtensionMeta[] = [];

  for (const slot of slots) {
    if (!slot.id) {
      logger.warn(
        "extensions",
        `Skipping slot extension meta: missing id (name="${slot.name}")`,
      );
      continue;
    }

    const manifest = slot.pluginManifest;
    const baseSchema = slot.settingsSchema ?? [];
    const hasPositionChoice = (slot.slotPositions?.length ?? 0) > 0;

    const linkedInterceptorSchema = manifest
      ? getInterceptors()
          .filter((i) => i.pluginManifest?.id === manifest.id)
          .flatMap((i) => i.settingsSchema ?? [])
      : [];

    const fullSchema: SettingField[] = [
      ...(manifest?.settingsSchema ?? []),
      ...baseSchema,
      ...linkedInterceptorSchema,
    ];

    if (hasPositionChoice) {
      fullSchema.push({
        key: SLOT_POSITION_SETTING_KEY,
        label: coreT
          ? coreT("settings-page.schema.slot-position.label") || "Position"
          : "Position",
        type: "select",
        options: [...slot.slotPositions!],
        description: coreT
          ? coreT("settings-page.schema.slot-position.description") ||
            "Where the slot content appears on the page."
          : "Where the slot content appears on the page.",
      });
    }

    const id = slot.settingsId ?? slot.id;
    const raw = await getSettings(id);
    const settings = maskSecrets(raw, fullSchema);
    if (raw["disabled"]) settings["disabled"] = raw["disabled"];

    if (hasPositionChoice) {
      const stored = raw[SLOT_POSITION_SETTING_KEY];
      const value =
        (typeof stored === "string" ? stored : undefined) ?? slot.position;
      settings[SLOT_POSITION_SETTING_KEY] = slot.slotPositions!.includes(
        value as typeof slot.position,
      )
        ? value
        : slot.position;
    }

    out.push({
      id,
      displayName: manifest?.name ?? slot.name,
      description: manifest?.description ?? slot.description,
      type: ExtensionStoreType.Plugin,
      configurable: fullSchema.length > 0,
      settingsSchema: fullSchema,
      settings,
      source: getSlotSource(slot.id),
      isClientExposed: slot.isClientExposed,
      needsAppRestart: isExtensionRestartFlagVisible(slot.needsAppRestart),
    });
  }

  return out;
};
