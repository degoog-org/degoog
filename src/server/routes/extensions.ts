import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { canBalrogPass, gandalf } from "./settings-auth";
import {
  getSettings,
  isDisabled,
  setSettings,
  mergeSecrets,
  type SettingValue,
} from "../utils/settings/plugin-settings";
import { getPluginCssIds, getPluginCssById } from "../utils/extension-support/plugin-assets";
import { getTransport } from "../extensions/transports/registry";
import { outgoingFetch } from "../utils/net/outgoing";
import { readFile } from "fs/promises";
import { extensionReadmeExists } from "../utils/extension-support/extension-docs";
import { getInstalledItems } from "../extensions/store/item-lifecycle";
import { reloadAfterAction } from "../extensions/store/item-specs";
import { makeExtID, folderFromExtID } from "../utils/extension-support/extension-id";
import { readObjectBody } from "../utils/hono";
import { isVersionAtLeast, getAppVersion } from "../../shared/utils/version";
import { savePluginUpload } from "../utils/extension-support/plugin-uploads";
import { logger } from "../utils/logger";
import {
  findExtensionMeta,
  findOptionsProvider,
  getExtensionMetaGroups,
} from "../extensions/resolve";
import { syncExtSettings } from "../extensions/settings-sync";
import { type ExtensionMeta, ExtensionStoreType } from "../types/extension";
import type { FieldOption } from "../../shared/field-options";
import type { SettingField } from "../../shared/setting-field";
import { settingsAuth } from "./_guards";

const router = new Hono();

const FALLBACK_UPLOAD_KB = 5 * 1024;
const UPLOAD_BODY_LIMIT_BYTES = 25 * 1024 * 1024;
const MAX_FIELD_OPTIONS = 500;
const OPTIONS_TIMEOUT_MS = 15_000;

const _fileFieldByKey = (
  schema: SettingField[],
  key: string,
): SettingField | null => {
  for (const field of schema) {
    if (field.type === "file" && field.key === key) return field;
    const nested = field.itemSchema?.find(
      (sub) => sub.type === "file" && sub.key === key,
    );
    if (nested) return nested;
  }
  return null;
};

const _optionsFieldByKey = (
  schema: SettingField[],
  key: string,
): SettingField | null => {
  for (const field of schema) {
    if (field.optionsFrom && field.key === key) return field;
    const nested = field.itemSchema?.find(
      (sub) => sub.optionsFrom && sub.key === key,
    );
    if (nested) return nested;
  }
  return null;
};

const _schemaValues = (
  body: Record<string, unknown>,
  schema: SettingField[],
): Record<string, SettingValue> => {
  const keys = new Set(schema.map((f) => f.key));
  const out: Record<string, SettingValue> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!keys.has(key)) continue;
    if (typeof value === "string") {
      out[key] = value;
    } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      out[key] = value as string[];
    }
  }
  return out;
};

const _cleanOptions = (raw: unknown): FieldOption[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: FieldOption[] = [];
  for (const entry of raw.slice(0, MAX_FIELD_OPTIONS)) {
    const value =
      typeof entry === "string"
        ? entry
        : typeof (entry as FieldOption)?.value === "string"
          ? (entry as FieldOption).value
          : "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const label = typeof (entry as FieldOption)?.label === "string"
      ? (entry as FieldOption).label
      : undefined;
    out.push(label ? { value, label } : { value });
  }
  return out;
};

const _withDeadline = async <T>(
  run: (signal: AbortSignal) => Promise<T> | T,
): Promise<T> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Options lookup timed out"));
    }, OPTIONS_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve(run(controller.signal)), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const _matchesAccept = (file: File, accept: string): boolean => {
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return mime.startsWith(token.slice(0, -1));
    return mime === token;
  });
};

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

const EXTENSION_GROUP_KEYS = new Set<string>(Object.values(EXTENSION_TYPE_KEY));

const groupKeyFor = (requested: string): ExtensionGroupKey | null => {
  const singular = EXTENSION_TYPE_KEY[requested as ExtensionStoreType];
  if (singular) return singular;
  return EXTENSION_GROUP_KEYS.has(requested)
    ? (requested as ExtensionGroupKey)
    : null;
};


router.get("/api/extensions", async (c) => {
  const [groups, installedItems] = await Promise.all([
    getExtensionMetaGroups(),
    getInstalledItems(),
  ]);
  const { engines, plugins, slots, interceptors, searchBar, tabs, themes, transports, autocomplete, shortcuts } =
    groups;

  for (const meta of Object.values(groups).flat()) {
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
    plugins: redact([...plugins, ...slots, ...interceptors, ...searchBar, ...tabs]),
    themes: redact(themes),
    transports: redact(transports),
    autocomplete: redact(autocomplete),
    shortcuts: redact(shortcuts),
  };

  const requestedType = c.req.query("type");
  if (requestedType) {
    const key = groupKeyFor(requestedType);
    if (!key) {
      logger.debug("extensions", `unknown type filter '${requestedType}'`);
      return c.json({ error: `Unknown extension type '${requestedType}'` }, 400);
    }
    return c.json({ [key]: full[key] });
  }

  return c.json(full);
});

router.post("/api/extensions/:id/settings", settingsAuth(), async (c) => {
  const id = c.req.param("id");
  const body = await readObjectBody<Record<string, unknown>>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const ext = await findExtensionMeta(id);

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

  await syncExtSettings(id, merged);

  return c.json({ ok: true });
});

router.post("/api/extensions/:id/options/:key", settingsAuth(), async (c) => {

  const id = c.req.param("id");
  const key = c.req.param("key");
  const body = await readObjectBody<Record<string, unknown>>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const ext = await findExtensionMeta(id);
  if (!ext) return c.json({ error: "Extension not found" }, 404);

  const field = _optionsFieldByKey(ext.settingsSchema, key);
  if (!field) return c.json({ error: "Field has no options source" }, 400);

  const provider = findOptionsProvider(id);
  if (!provider) return c.json({ error: "Extension cannot list options" }, 400);

  const stored = await getSettings(id);
  const values = mergeSecrets(
    _schemaValues(body, ext.settingsSchema),
    stored,
    ext.settingsSchema,
  );

  try {
    const result = await _withDeadline((signal) => provider(key, values, signal));
    return c.json({
      ok: true,
      options: _cleanOptions(result?.options),
      notice: typeof result?.notice === "string" ? result.notice : "",
      value: typeof result?.value === "string" ? result.value : "",
    });
  } catch (err) {
    logger.warn("extensions", `Options lookup failed for ${id}.${key}`, err);
    return c.json({ error: "Could not load options" }, 502);
  }
});

router.post(
  "/api/extensions/:id/upload",
  bodyLimit({ maxSize: UPLOAD_BODY_LIMIT_BYTES }),
  settingsAuth(),
  async (c) => {
    const id = c.req.param("id");
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: "Invalid upload" }, 400);
    }

    const key = form.get("key");
    const file = form.get("file");
    if (typeof key !== "string" || !(file instanceof File)) {
      return c.json({ error: "Missing file or key" }, 400);
    }

    const ext = await findExtensionMeta(id);
    if (!ext) return c.json({ error: "Extension not found" }, 404);

    const field = _fileFieldByKey(ext.settingsSchema, key);
    if (!field) return c.json({ error: "Unknown file field" }, 400);

    if (field.accept && !_matchesAccept(file, field.accept)) {
      return c.json({ error: "File type not allowed" }, 400);
    }
    const sizeKb = file.size / 1024;
    const configuredMax = field.maxSizeKb ? Number(field.maxSizeKb) : 0;
    const maxKb = configuredMax > 0 ? configuredMax : FALLBACK_UPLOAD_KB;
    const minKb = field.minSizeKb ? Number(field.minSizeKb) : 0;
    if (sizeKb > maxKb) {
      return c.json({ error: `File exceeds ${maxKb} KB` }, 400);
    }
    if (minKb > 0 && sizeKb < minKb) {
      return c.json({ error: `File smaller than ${minKb} KB` }, 400);
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const saved = await savePluginUpload(id, file.name, data);
    if (!saved) return c.json({ error: "Upload rejected" }, 400);

    logger.debug("uploads", `stored ${saved.name} for ${id} field=${key}`);
    return c.json({ ok: true, path: saved.path });
  },
);

router.post("/api/extensions/transports/:name/test", settingsAuth(), async (c) => {

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

router.get("/api/extensions/:id/readme", settingsAuth(), async (c) => {

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
