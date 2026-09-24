import { commandBuiltinsDir } from "../commands/builtins-dir";
import {
  type ExtensionMeta,
  ExtensionStoreType,
  SLOT_POSITION_SETTING_KEY,
  SLOT_SEARCH_TYPES_KEY,
  type SlotPlugin,
  type Translate,
} from "../../types/extension";
import { parseTypeList, SlotPanelPosition } from "../../../shared/search-types";
import type { SettingField } from "../../../shared/setting-field";
import { logger } from "../../utils/logger";
import { pluginsDir } from "../../utils/paths";
import {
  initPlugin,
  loadPluginAssets,
  lockinNameSpace,
  lockinSettingsId,
} from "../../utils/extension-support/plugin-assets";
import { extensionReadmeExists } from "../../utils/extension-support/extension-docs";
import { getSettings, isDisabled, maskSecrets } from "../../utils/settings/plugin-settings";
import { bootCircuitFromPath } from "../../utils/extension-support/translation-circuit";
import { createRegistry } from "../registry-factory";
import { getInterceptors } from "../interceptors/registry";
import { isPluginManifest } from "../plugin-manifest";
import { getInstalledSearchTypes, manifestEngineSchema } from "../engines/catalog";
import { baseSlotTypes } from "../../utils/extension-support/slot-types";
import {
  isExtensionRestartFlagVisible,
} from "../../utils/extension-support/restart-state";

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
  dirs: () => [{ dir: commandBuiltinsDir, source: "builtin" }, { dir: pluginsDir() }],
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

function getSlotSource(slotId: string): "builtin" | "plugin" {
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
  const installedTypes = parseTypeList(await getInstalledSearchTypes());

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

    const manifestSchema = manifest?.settingsSchema ?? [];
    const manifestKeys = new Set(manifestSchema.map((f) => f.key));
    const linkedEngineSchema = manifest
      ? manifestEngineSchema(manifest.id).filter((f) => !manifestKeys.has(f.key))
      : [];

    const fullSchema: SettingField[] = [
      ...manifestSchema,
      ...linkedEngineSchema,
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

    const slotDefaults = baseSlotTypes(slot);
    const typeOptions = [
      ...new Set([...slotDefaults, ...installedTypes]),
    ];

    fullSchema.push({
      key: SLOT_SEARCH_TYPES_KEY,
      label: coreT
        ? coreT("settings-page.schema.slot-search-types.label") || "Search types"
        : "Search types",
      type: "multiselect",
      options: typeOptions,
      default: slotDefaults.join(","),
      description: coreT
        ? coreT("settings-page.schema.slot-search-types.description") ||
          "Which result tabs this slot renders on. Images are not supported."
        : "Which result tabs this slot renders on. Images are not supported.",
    });

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

    const storedTypes = raw[SLOT_SEARCH_TYPES_KEY];
    settings[SLOT_SEARCH_TYPES_KEY] = (
      storedTypes === undefined ? slotDefaults : parseTypeList(storedTypes)
    ).filter((type) => typeOptions.includes(type));

    const { exists: docsExist } = await extensionReadmeExists(id);

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
      extensionDocsAvailable: docsExist,
    });
  }

  return out;
};
