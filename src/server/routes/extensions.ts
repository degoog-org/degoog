import { Hono } from "hono";
import {
  getEngineExtensionMeta,
  getEngineMap,
  setEnginesLocale,
} from "../extensions/engines/registry";
import {
  getSettingsTokenFromRequest,
  validateSettingsToken,
} from "./settings-auth";
import {
  getPluginExtensionMeta,
  getCommandInstanceById,
  setCommandsLocale,
} from "../extensions/commands/registry";
import { getCoreTranslator } from "./pages";
import { getLocale } from "../utils/hono";
import {
  getSlotPlugins,
  getSlotPluginById,
  getSlotSource,
} from "../extensions/slots/registry";
import { getSearchBarActionExtensionMeta } from "../extensions/search-bar/registry";
import { getThemeExtensionMeta } from "../extensions/themes/registry";
import {
  getSettings,
  dumbFallbackBecauseIDontThink,
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
  type Translate,
} from "../types";
import {
  getTransportExtensionMeta,
  getTransport,
} from "../extensions/transports/registry";
import {
  getAutocompleteExtensionMeta,
  getAutocompleteProviderById,
} from "../extensions/autocomplete/registry";
import { outgoingFetch } from "../utils/outgoing";
import { readFile } from "fs/promises";
import { extensionReadmeExists } from "../utils/extension-docs";
import { getInstalledItems } from "../extensions/store/item-ops";
import { isVersionAtLeast, getAppVersion } from "../utils/version";
import { logger } from "../utils/logger";

const router = new Hono();

async function getSlotExtensionMeta(
  coreT?: Translate,
): Promise<ExtensionMeta[]> {
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
    const raw = slot.settingsFallbackIds?.length
      ? await dumbFallbackBecauseIDontThink(id, slot.settingsFallbackIds)
      : await getSettings(id);
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
  const [
    engines,
    plugins,
    slotMeta,
    searchBarMeta,
    themes,
    transports,
    autocomplete,
    installedItems,
  ] = await Promise.all([
    getEngineExtensionMeta(coreT),
    getPluginExtensionMeta(coreT),
    getSlotExtensionMeta(coreT),
    getSearchBarActionExtensionMeta(),
    getThemeExtensionMeta(),
    getTransportExtensionMeta(),
    getAutocompleteExtensionMeta(),
    getInstalledItems(),
  ]);

  const allMetas = [
    ...engines,
    ...plugins,
    ...slotMeta,
    ...searchBarMeta,
    ...themes,
    ...transports,
    ...autocomplete,
  ];
  for (const meta of allMetas) {
    const inst = installedItems.find((i) => {
      const prefixes =
        i.type === ExtensionStoreType.Plugin
          ? ["plugin-", "slot-"]
          : i.type === ExtensionStoreType.Theme
            ? ["theme-"]
            : i.type === ExtensionStoreType.Engine
              ? ["engine-"]
              : i.type === ExtensionStoreType.Autocomplete
                ? ["autocomplete-"]
                : ["transport-"];
      return prefixes.some((p) => meta.id === p + i.installedAs);
    });
    if (inst?.minDegoogVersion) {
      meta.requiresNewerVersion = !isVersionAtLeast(
        getAppVersion(),
        inst.minDegoogVersion,
      );
    }
  }

  return c.json({
    engines,
    plugins: [...plugins, ...slotMeta, ...searchBarMeta],
    themes,
    transports,
    autocomplete,
  });
});

router.post("/api/extensions/:id/settings", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token)))
    return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const locale = getLocale(c);
  const coreT = await getCoreTranslator();
  if (locale) {
    setCommandsLocale(locale);
    setEnginesLocale(locale);
    coreT.setLocale(locale);
  }
  const [
    engines,
    plugins,
    slotMeta,
    searchBarMeta,
    themes,
    transportMeta,
    autocompleteMeta,
  ] = await Promise.all([
    getEngineExtensionMeta(coreT),
    getPluginExtensionMeta(coreT),
    getSlotExtensionMeta(coreT),
    getSearchBarActionExtensionMeta(),
    getThemeExtensionMeta(),
    getTransportExtensionMeta(),
    getAutocompleteExtensionMeta(),
  ]);
  const ext = [
    ...engines,
    ...plugins,
    ...slotMeta,
    ...searchBarMeta,
    ...themes,
    ...transportMeta,
    ...autocompleteMeta,
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

  if (id.startsWith("autocomplete-")) {
    const providerInstance = getAutocompleteProviderById(id);
    if (providerInstance?.configure) providerInstance.configure(merged);
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

router.get("/api/extensions/:id/readme", async (c) => {
  const token = getSettingsTokenFromRequest(c);
  if (!(await validateSettingsToken(token)))
    return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { exists, readmePath } = await extensionReadmeExists(id);
  if (!exists || !readmePath) return c.json({ error: "Not found" }, 404);
  try {
    const markdown = await readFile(readmePath, "utf-8");
    return c.json({ markdown });
  } catch {
    return c.json({ error: "Not found" }, 404);
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
