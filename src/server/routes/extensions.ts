import { Hono } from "hono";
import {
  getEngineExtensionMeta,
  getEngineMap,
} from "../extensions/engines/registry";
import { getSettingsTokenFromRequest, validateSettingsToken } from "./settings-auth";
import {
  getPluginExtensionMeta,
  getCommandInstanceById,
} from "../extensions/commands/registry";
import {
  getSlotPlugins,
  getSlotPluginById,
} from "../extensions/slots/registry";
import { getSearchBarActionExtensionMeta } from "../extensions/search-bar/registry";
import { getThemeExtensionMeta } from "../extensions/themes/registry";
import {
  getSettings,
  isDisabled,
  setSettings,
  mergeSecrets,
  maskSecrets,
  type SettingValue,
} from "../utils/plugin-settings";
import { getPluginCssIds, getPluginCssById } from "../utils/plugin-assets";
import {
  ExtensionStoreType,
  SLOT_POSITION_SETTING_KEY,
  type ExtensionMeta,
  type SettingField,
} from "../types";

const router = new Hono();

async function getSlotExtensionMeta(): Promise<ExtensionMeta[]> {
  const slots = getSlotPlugins();
  const out: ExtensionMeta[] = [];
  for (const slot of slots) {
    const baseSchema = slot.settingsSchema ?? [];
    const hasPositionChoice = (slot.slotPositions?.length ?? 0) > 0;
    const fullSchema: SettingField[] = [...baseSchema];
    if (hasPositionChoice) {
      fullSchema.push({
        key: SLOT_POSITION_SETTING_KEY,
        label: "Position",
        type: "select",
        options: [...slot.slotPositions!],
        description: "Where the slot content appears (e.g. knowledge-panel replaces the default knowledge panel).",
      });
    }
    const id = slot.settingsId ?? `slot-${slot.id}`;
    const raw = await getSettings(id);
    const settings = maskSecrets(raw, fullSchema);
    if (raw["disabled"]) settings["disabled"] = raw["disabled"];
    if (hasPositionChoice) {
      const stored = raw[SLOT_POSITION_SETTING_KEY];
      const value =
        (typeof stored === "string" ? stored : undefined) ?? slot.position;
      settings[SLOT_POSITION_SETTING_KEY] =
        slot.slotPositions!.includes(value as typeof slot.position)
          ? value
          : slot.position;
    }
    out.push({
      id,
      displayName: slot.name,
      description: slot.description,
      type: ExtensionStoreType.Plugin,
      configurable: fullSchema.length > 0,
      settingsSchema: fullSchema,
      settings,
    });
  }
  return out;
}

router.get("/api/extensions", async (c) => {
  const [engines, plugins, slotMeta, searchBarMeta, themes] = await Promise.all(
    [
      getEngineExtensionMeta(),
      getPluginExtensionMeta(),
      getSlotExtensionMeta(),
      getSearchBarActionExtensionMeta(),
      getThemeExtensionMeta(),
    ],
  );
  return c.json({
    engines,
    plugins: [...plugins, ...slotMeta, ...searchBarMeta],
    themes,
  });
});

router.post("/api/extensions/:id/settings", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token)))
    return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json<Record<string, unknown>>();

  const [engines, plugins, slotMeta, searchBarMeta, themes] = await Promise.all(
    [
      getEngineExtensionMeta(),
      getPluginExtensionMeta(),
      getSlotExtensionMeta(),
      getSearchBarActionExtensionMeta(),
      getThemeExtensionMeta(),
    ],
  );
  const ext = [
    ...engines,
    ...plugins,
    ...slotMeta,
    ...searchBarMeta,
    ...themes,
  ].find((e) => e.id === id);

  if (!ext) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const schemaKeys = new Set(ext.settingsSchema.map((f) => f.key));
  schemaKeys.add("disabled");
  const filtered: Record<string, SettingValue> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!schemaKeys.has(key)) continue;
    if (typeof value === "string") {
      filtered[key] = value;
    } else if (
      Array.isArray(value) &&
      value.every((v) => typeof v === "string")
    ) {
      filtered[key] = value as string[];
    }
  }

  const existing = await getSettings(id);
  const merged = mergeSecrets(filtered, existing, ext.settingsSchema);
  await setSettings(id, merged);

  if (
    id.startsWith("plugin-") &&
    ext.settingsSchema.some((f) => f.key === "useAsSettingsGate")
  ) {
    const slug = id.slice(7);
    const gateValue = `plugin:${slug}`;
    const mid = await getSettings("middleware");
    const useGate = mid.settingsGate;
    const useGateStr = typeof useGate === "string" ? useGate.trim() : "";
    if (merged.useAsSettingsGate === "true") {
      await setSettings("middleware", { ...mid, settingsGate: gateValue });
    } else if (useGateStr === gateValue) {
      await setSettings("middleware", { ...mid, settingsGate: "" });
    }
  }

  const engineInstance = getEngineMap()[id];
  if (engineInstance?.configure) engineInstance.configure(merged);

  const commandInstance = getCommandInstanceById(id);
  if (commandInstance?.configure) commandInstance.configure(merged);

  const slotMatch = id.startsWith("slot-")
    ? id.slice(5)
    : getSlotPlugins().find((s) => (s.settingsId ?? `slot-${s.id}`) === id)?.id;
  if (slotMatch) {
    const slotPlugin = getSlotPluginById(slotMatch);
    if (slotPlugin?.configure) slotPlugin.configure(merged);
  }

  return c.json({ ok: true });
});

router.get("/api/plugins/styles.css", async (c) => {
  const ids = getPluginCssIds();
  const parts: string[] = [];
  for (const id of ids) {
    if (await isDisabled(id)) continue;
    const css = getPluginCssById(id);
    if (css) parts.push(css);
  }
  c.header("Content-Type", "text/css");
  return c.body(parts.join("\n"));
});

export default router;
