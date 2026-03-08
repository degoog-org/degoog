import { Hono } from "hono";
import { getEngineExtensionMeta, getEngineMap } from "../engines/registry";
import {
  getPluginExtensionMeta,
  getCommandInstanceById,
} from "../commands/registry";
import { getSlotPlugins, getSlotPluginById } from "../slots/registry";
import { getThemeExtensionMeta } from "../themes/registry";
import {
  getSettings,
  setSettings,
  mergeSecrets,
  maskSecrets,
  type SettingValue,
} from "../plugin-settings";
import { getAllPluginCss } from "../plugin-assets";
import type { ExtensionMeta } from "../types";

const router = new Hono();

async function getSlotExtensionMeta(): Promise<ExtensionMeta[]> {
  const slots = getSlotPlugins();
  const out: ExtensionMeta[] = [];
  for (const slot of slots) {
    const schema = slot.settingsSchema ?? [];
    if (schema.length === 0) continue;
    const id = slot.settingsId ?? `slot-${slot.id}`;
    const raw = await getSettings(id);
    const settings = maskSecrets(raw, schema);
    if (raw["disabled"]) settings["disabled"] = raw["disabled"];
    out.push({
      id,
      displayName: slot.name,
      description: slot.description,
      type: "plugin",
      configurable: true,
      settingsSchema: schema,
      settings,
    });
  }
  return out;
}

router.get("/api/extensions", async (c) => {
  const [engines, plugins, slotMeta, themes] = await Promise.all([
    getEngineExtensionMeta(),
    getPluginExtensionMeta(),
    getSlotExtensionMeta(),
    getThemeExtensionMeta(),
  ]);
  return c.json({ engines, plugins: [...plugins, ...slotMeta], themes });
});

router.post("/api/extensions/:id/settings", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<Record<string, unknown>>();

  const [engines, plugins, slotMeta, themes] = await Promise.all([
    getEngineExtensionMeta(),
    getPluginExtensionMeta(),
    getSlotExtensionMeta(),
    getThemeExtensionMeta(),
  ]);
  const ext = [...engines, ...plugins, ...slotMeta, ...themes].find(
    (e) => e.id === id,
  );

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
    } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      filtered[key] = value as string[];
    }
  }

  const existing = await getSettings(id);
  const merged = mergeSecrets(filtered, existing, ext.settingsSchema);
  await setSettings(id, merged);

  if (id.startsWith("plugin-") && ext.settingsSchema.some((f) => f.key === "useAsSettingsGate")) {
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
  if (commandInstance?.configure) commandInstance.configure(merged as Record<string, string>);

  const slotMatch = id.startsWith("slot-") ? id.slice(5) : getSlotPlugins().find((s) => (s.settingsId ?? `slot-${s.id}`) === id)?.id;
  if (slotMatch) {
    const slotPlugin = getSlotPluginById(slotMatch);
    if (slotPlugin?.configure) slotPlugin.configure(merged as Record<string, string>);
  }

  return c.json({ ok: true });
});

router.get("/api/plugins/styles.css", (c) => {
  c.header("Content-Type", "text/css");
  return c.body(getAllPluginCss());
});

export default router;
