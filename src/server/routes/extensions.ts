import { Hono } from "hono";
import {
  getEngineExtensionMeta,
  getEngineMap,
} from "../extensions/engines/registry";
import { canBalrogPass, gandalf } from "./settings-auth";
import {
  getPluginExtensionMeta,
  getCommandInstanceById,
} from "../extensions/commands/registry";
import { getCoreTranslator } from "./pages";
import {
  getSlotPlugins,
  getSlotPluginById,
  getSlotExtensionMeta,
} from "../extensions/slots/registry";
import {
  getInterceptorMeta,
  getInterceptorBySettingsId,
} from "../extensions/interceptors/registry";
import { getSearchBarActionExtensionMeta } from "../extensions/search-bar/registry";
import { getThemeExtensionMeta } from "../extensions/themes/registry";
import {
  getSettings,
  isDisabled,
  setSettings,
  mergeSecrets,
  type SettingValue,
} from "../utils/plugin-settings";
import { getPluginCssIds, getPluginCssById } from "../utils/plugin-assets";
import {
  ExtensionStoreType,
  type ExtensionMeta,
} from "../types";
import {
  getTransportExtensionMeta,
  getTransport,
} from "../extensions/transports/registry";
import {
  getAutocompleteExtensionMeta,
  getAutocompleteProviderById,
} from "../extensions/autocomplete/registry";
import { getShortcutExtensionMeta } from "../extensions/shortcuts/registry";
import { outgoingFetch } from "../utils/outgoing";
import { readFile } from "fs/promises";
import { extensionReadmeExists } from "../utils/extension-docs";
import { getInstalledItems, reloadAfterAction } from "../extensions/store/item-ops";
import { makeExtID, folderFromExtID } from "../utils/extension-id";
import { readObjectBody } from "../utils/hono";
import { isVersionAtLeast, getAppVersion } from "../utils/version";
import { logger } from "../utils/logger";

const router = new Hono();

type ExtensionGroupKey =
  | "engines"
  | "plugins"
  | "themes"
  | "transports"
  | "autocomplete"
  | "shortcuts";

const EXTENSION_TYPE_KEY: Record<ExtensionStoreType, ExtensionGroupKey> = {
  [ExtensionStoreType.Engine]: "engines",
  [ExtensionStoreType.Plugin]: "plugins",
  [ExtensionStoreType.Theme]: "themes",
  [ExtensionStoreType.Transport]: "transports",
  [ExtensionStoreType.Autocomplete]: "autocomplete",
  [ExtensionStoreType.Shortcut]: "shortcuts",
};


router.get("/api/extensions", async (c) => {
  const coreT = await getCoreTranslator();
  const [
    engines,
    plugins,
    slotMeta,
    interceptorMeta,
    searchBarMeta,
    themes,
    transports,
    autocomplete,
    shortcuts,
    installedItems,
  ] = await Promise.all([
    getEngineExtensionMeta(coreT),
    getPluginExtensionMeta(coreT),
    getSlotExtensionMeta(coreT),
    getInterceptorMeta(),
    getSearchBarActionExtensionMeta(),
    getThemeExtensionMeta(),
    getTransportExtensionMeta(),
    getAutocompleteExtensionMeta(),
    getShortcutExtensionMeta(),
    getInstalledItems(),
  ]);

  const allMetas = [
    ...engines,
    ...plugins,
    ...slotMeta,
    ...interceptorMeta,
    ...searchBarMeta,
    ...themes,
    ...transports,
    ...autocomplete,
    ...shortcuts,
  ];
  for (const meta of allMetas) {
    const inst = installedItems.find((i) => {
      const expected =
        i.type === ExtensionStoreType.Plugin
          ? [
              makeExtID(i.installedAs, "command"),
              makeExtID(i.installedAs, "slot"),
              makeExtID(i.installedAs, "middleware"),
              makeExtID(i.installedAs, "tab"),
            ]
          : i.type === ExtensionStoreType.Theme
            ? [makeExtID(i.installedAs, "theme")]
            : i.type === ExtensionStoreType.Engine
              ? [makeExtID(i.installedAs, "engine")]
              : i.type === ExtensionStoreType.Autocomplete
                ? [makeExtID(i.installedAs, "autocomplete")]
                : i.type === ExtensionStoreType.Shortcut
                  ? [makeExtID(i.installedAs, "shortcut")]
                  : [makeExtID(i.installedAs, "transport")];
      return expected.includes(meta.id);
    });
    if (inst?.minDegoogVersion) {
      meta.requiresNewerVersion = !isVersionAtLeast(
        getAppVersion(),
        inst.minDegoogVersion,
      );
    }
  }

  const authenticated = await gandalf(canBalrogPass(c));
  const redact = (items: ExtensionMeta[]): ExtensionMeta[] =>
    authenticated ? items : items.map((m) => ({ ...m, settings: {} }));

  const full = {
    engines: redact(engines),
    plugins: redact([...plugins, ...slotMeta, ...interceptorMeta, ...searchBarMeta]),
    themes: redact(themes),
    transports: redact(transports),
    autocomplete: redact(autocomplete),
    shortcuts: redact(shortcuts),
  };

  const requestedType = c.req.query("type");
  if (requestedType) {
    const key = EXTENSION_TYPE_KEY[requestedType as ExtensionStoreType];
    if (!key) {
      logger.debug("extensions", `unknown type filter '${requestedType}'`);
      return c.json({ error: `Unknown extension type '${requestedType}'` }, 400);
    }
    return c.json({ [key]: full[key] });
  }

  return c.json(full);
});

router.post("/api/extensions/:id/settings", async (c) => {
  const token = canBalrogPass(c);
  if (!(await gandalf(token)))
    return c.json({ error: "You shall not pass!" }, 401);
  const id = c.req.param("id");
  const body = await readObjectBody<Record<string, unknown>>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const coreT = await getCoreTranslator();
  const [
    engines,
    plugins,
    slotMeta,
    iceptMeta,
    searchBarMeta,
    themes,
    transportMeta,
    autocompleteMeta,
    shortcutMeta,
  ] = await Promise.all([
    getEngineExtensionMeta(coreT),
    getPluginExtensionMeta(coreT),
    getSlotExtensionMeta(coreT),
    getInterceptorMeta(),
    getSearchBarActionExtensionMeta(),
    getThemeExtensionMeta(),
    getTransportExtensionMeta(),
    getAutocompleteExtensionMeta(),
    getShortcutExtensionMeta(),
  ]);
  const ext = [
    ...engines,
    ...plugins,
    ...slotMeta,
    ...iceptMeta,
    ...searchBarMeta,
    ...themes,
    ...transportMeta,
    ...autocompleteMeta,
    ...shortcutMeta,
  ].find((e) => e.id === id);

  if (!ext) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const schemaKeys = new Set(ext.settingsSchema.map((f) => f.key));
  schemaKeys.add("disabled");
  schemaKeys.add("priority");
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
  const wasDisabled = existing.disabled === "true";
  const nowDisabled = merged.disabled === "true";
  await setSettings(id, merged);

  if (wasDisabled !== nowDisabled) {
    const storeType = Object.values(ExtensionStoreType).includes(
      ext.type as ExtensionStoreType,
    )
      ? (ext.type as ExtensionStoreType)
      : ExtensionStoreType.Plugin;
    try {
      await reloadAfterAction(storeType, false);
    } catch (err) {
      logger.warn("extensions", `Failed to reload after toggle of ${id}`, err);
    }
  }

  if (
    id.endsWith("-command") &&
    ext.settingsSchema.some((f) => f.key === "useAsSettingsGate")
  ) {
    const slug = folderFromExtID(id, "command");
    const middlewareId = makeExtID(slug, "middleware");
    const gateValue = `plugin:${middlewareId}`;
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

  const slotMatch = getSlotPlugins().find((s) => s.settingsId === id)?.id;
  if (slotMatch) {
    const slotPlugin = getSlotPluginById(slotMatch);
    if (slotPlugin?.configure) slotPlugin.configure(merged);
    if (slotPlugin && merged.priority !== undefined) {
      const p = parseInt(String(merged.priority), 10);
      slotPlugin.priority = isNaN(p) ? 0 : p;
    }
  }

  const interceptorMatch = getInterceptorBySettingsId(id);
  if (interceptorMatch) {
    if (interceptorMatch.configure) interceptorMatch.configure(merged);
    if (merged.priority !== undefined) {
      const p = parseInt(String(merged.priority), 10);
      interceptorMatch.priority = isNaN(p) ? 0 : p;
    }
  }

  if (id.endsWith("-transport")) {
    const transportInstance = getTransport(id);
    if (transportInstance?.configure) transportInstance.configure(merged);
  }

  if (id.endsWith("-autocomplete")) {
    const providerInstance = getAutocompleteProviderById(id);
    if (providerInstance?.configure) providerInstance.configure(merged);
  }

  return c.json({ ok: true });
});

router.post("/api/extensions/transports/:name/test", async (c) => {
  const token = canBalrogPass(c);
  if (!(await gandalf(token)))
    return c.json({ error: "You shall not pass!" }, 401);

  const name = c.req.param("name");
  const transport = getTransport(name);
  if (!transport)
    return c.json({ ok: false, message: "Transport not found" }, 404);

  const body = await readObjectBody<Record<string, string>>(c);
  if (body && transport.configure) {
    transport.configure(body);
  }

  try {
    const res = await outgoingFetch("https://example.com", {}, name);
    if (res.ok) return c.json({ ok: true, message: `OK (${res.status})` });
    return c.json({ ok: false, message: `HTTP ${res.status}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    return c.json({ ok: false, message: msg });
  } finally {
    if (body && transport.configure) {
      const saved = await getSettings(name);
      transport.configure(saved);
    }
  }
});

router.get("/api/extensions/:id/readme", async (c) => {
  const token = canBalrogPass(c);
  if (!(await gandalf(token)))
    return c.json({ error: "You shall not pass!" }, 401);

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
