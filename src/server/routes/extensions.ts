import { Hono } from "hono";
import {
  getCommandInstanceById,
  getPluginExtensionMeta,
  setCommandsLocale,
} from "../extensions/commands/registry";
import {
  getEngineExtensionMeta,
  getEngineMap,
  setEnginesLocale,
} from "../extensions/engines/registry";
import { getSearchBarActionExtensionMeta } from "../extensions/search-bar/registry";
import {
  getSlotPluginById,
  getSlotPlugins,
  getSlotSource,
} from "../extensions/slots/registry";
import { getThemeExtensionMeta } from "../extensions/themes/registry";
import {
  getTransport,
  getTransportExtensionMeta,
} from "../extensions/transports/registry";
import {
  ExtensionStoreType,
  SLOT_POSITION_SETTING_KEY,
  type ExtensionMeta,
  type SettingField,
  type Translate,
} from "../types";
import { getLocale } from "../utils/hono";
import { outgoingFetch } from "../utils/outgoing";
import { getPluginCssById, getPluginCssIds } from "../utils/plugin-assets";
import {
  applyPluginOrder,
  getPluginOrder,
  setPluginOrder,
} from "../utils/plugin-order";
import {
  getSettings,
  isDisabled,
  maskSecrets,
  mergeSecrets,
  setSettings,
  type SettingValue,
} from "../utils/plugin-settings";
import { getCoreTranslator } from "./pages";
import {
  getSettingsTokenFromRequest,
  validateSettingsToken,
} from "./settings-auth";

const router = new Hono();

async function getSlotExtensionMeta(
  coreT?: Translate,
): Promise<ExtensionMeta[]> {
  const slots = getSlotPlugins();
  const out: ExtensionMeta[] = [];
  for (const slot of slots) {
    const baseSchema = slot.settingsSchema ?? [];
    const hasPositionChoice = (slot.slotPositions?.length ?? 0) > 0;
    const fullSchema: SettingField[] = [...baseSchema];
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
    const id = slot.settingsId ?? `slot-${slot.id}`;
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
      displayName: slot.name,
      description: slot.description,
      type: ExtensionStoreType.Plugin,
      configurable: fullSchema.length > 0,
      settingsSchema: fullSchema,
      settings,
      source: getSlotSource(slot.id),
    });
  }
  return out;
}

router.get("/api/extensions", async (c) => {
  const locale = getLocale(c);
  const coreT = await getCoreTranslator();
  if (locale) {
    setCommandsLocale(locale);
    setEnginesLocale(locale);
    coreT.setLocale(locale);
  }
  const [engines, plugins, slotMeta, searchBarMeta, themes, transports] =
    await Promise.all([
      getEngineExtensionMeta(coreT),
      getPluginExtensionMeta(coreT),
      getSlotExtensionMeta(coreT),
      getSearchBarActionExtensionMeta(),
      getThemeExtensionMeta(),
      getTransportExtensionMeta(),
    ]);

  const allPlugins = [...plugins, ...slotMeta, ...searchBarMeta];
  const order = await getPluginOrder();

  return c.json({
    engines,
    plugins: applyPluginOrder(allPlugins, order, (p) => p.id),
    themes,
    transports,
  });
});

router.get("/api/extensions/order", async (c) => {
  const order = await getPluginOrder();
  return c.json({ order });
});

router.put("/api/extensions/order", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token)))
    return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{ order?: unknown }>();
  if (
    !Array.isArray(body.order) ||
    !body.order.every((v: unknown) => typeof v === "string")
  )
    return c.json({ error: "order must be a string array" }, 400);

  await setPluginOrder(body.order as string[]);
  return c.json({ ok: true });
});

router.post("/api/extensions/:id/settings", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token)))
    return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json<Record<string, unknown>>();

  const locale = getLocale(c);
  const coreT = await getCoreTranslator();
  if (locale) {
    setCommandsLocale(locale);
    setEnginesLocale(locale);
    coreT.setLocale(locale);
  }
  const [engines, plugins, slotMeta, searchBarMeta, themes, transportMeta] =
    await Promise.all([
      getEngineExtensionMeta(coreT),
      getPluginExtensionMeta(coreT),
      getSlotExtensionMeta(coreT),
      getSearchBarActionExtensionMeta(),
      getThemeExtensionMeta(),
      getTransportExtensionMeta(),
    ]);
  const ext = [
    ...engines,
    ...plugins,
    ...slotMeta,
    ...searchBarMeta,
    ...themes,
    ...transportMeta,
  ].find((e) => e.id === id);

  if (!ext) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const schemaKeys = new Set(ext.settingsSchema.map((f) => f.key));
  schemaKeys.add("disabled");
  if (ext.type === ExtensionStoreType.Engine) {
    schemaKeys.add("score");
    schemaKeys.add("outgoingTransport");
  }
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

  if (id.startsWith("transport-")) {
    const transportName = id.slice(10);
    const transportInstance = getTransport(transportName);
    if (transportInstance?.configure) transportInstance.configure(merged);
  }

  return c.json({ ok: true });
});

router.post("/api/extensions/transports/:name/test", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token)))
    return c.json({ error: "Unauthorized" }, 401);

  const name = c.req.param("name");
  if (!getTransport(name))
    return c.json({ ok: false, message: "Transport not found" }, 404);

  try {
    const res = await outgoingFetch("https://example.com", {}, name);
    if (res.ok) return c.json({ ok: true, message: `OK (${res.status})` });
    return c.json({ ok: false, message: `HTTP ${res.status}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    return c.json({ ok: false, message: msg });
  }
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
