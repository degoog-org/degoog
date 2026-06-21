import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import { Hono } from "hono";
import { outgoingFetch } from "../utils/outgoing";
import { defaultEnginesFile, shortcutsDir } from "../utils/paths";
import { asBoolean, asString } from "../utils/plugin-settings";
import { getRandomUserAgent } from "../utils/user-agents";
import { DEFAULT_LANGUAGES } from "../utils/search";
import { getServerKeyHex, regenerateServerKey } from "../utils/server-key";
import { resolveBanHours, syncBlocklist } from "../utils/bot-trap";
import { addEntry, listActive, removeEntry } from "../utils/blocklist";
import { guardSettingsRoute, isPasswordRequired } from "./settings-auth";
import { readObjectBody } from "../utils/hono";
import { SHORTCUT_ACTIONS } from "../../shared/shortcuts";
import {
  getEditableShortcutFile,
  getShortcutActions,
  getShortcutDisabledStates,
  reloadShortcutsRegistry,
} from "../extensions/shortcuts/registry";
import { makeExtID, slugifyIdPart } from "../utils/extension-id";
import {
  readShortcutsSettings,
  writeShortcutsSettings,
  saveShortcutBindings,
} from "../utils/shortcuts-settings";
import {
  getInstanceSettings,
  setInstanceSettings,
  updateInstanceSettings,
  type ServerSettingValue,
} from "../utils/server-settings";
import {
  SETTINGS_SCHEMA,
  coerceSetting,
  type SettingKey,
} from "../utils/settings-schema";
import {
  isIndexerListKey,
  readIndexerLists,
  writeIndexerList,
} from "../indexer/config/lists";
import {
  isDomainListKey,
  readDomainLists,
  writeDomainList,
} from "../utils/domain-lists";
import {
  MAX_INLINE_FIELD_CHARS,
  OVERSIZED_FIELDS_KEY,
  OVERSIZED_TEXT_FIELDS,
  type OversizedFieldInfo,
} from "../../shared/indexer";
import { SEARCH_LIST_FIELDS } from "../../shared/settings-lists";
import { logger } from "../utils/logger";

const router = new Hono();

const LIST_FIELDS = [...OVERSIZED_TEXT_FIELDS, ...SEARCH_LIST_FIELDS] as const;

const isListField = (key: string): boolean =>
  isIndexerListKey(key) || isDomainListKey(key);

const writeListField = async (key: string, value: string): Promise<void> => {
  if (isIndexerListKey(key)) await writeIndexerList(key, value);
  else if (isDomainListKey(key)) await writeDomainList(key, value);
};

const _normalizeHostname = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

const _splitLines = (raw: string): string[] =>
  raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

const _appendBlock = (existing: string, source: string): string => {
  const lines = _splitLines(existing);
  if (lines.includes(source)) return existing;
  lines.push(source);
  return lines.join("\n");
};

const _appendReplace = (
  existing: string,
  source: string,
  target: string,
): string => {
  const next = _splitLines(existing).filter((l) => {
    const [src] = l.split("->").map((s) => s.trim());
    return src !== source;
  });
  next.push(`${source} -> ${target}`);
  return next.join("\n");
};

const _upsertScore = (
  existing: string,
  source: string,
  score: number,
): string => {
  const next = _splitLines(existing).filter((l) => {
    const [src] = l.split("|").map((s) => s.trim());
    return src !== source;
  });
  next.push(`${source}|${score}`);
  return next.join("\n");
};

const IP_CHECK_URL = "https://api.ipify.org?format=json";
const IP_CHECK_TIMEOUT_MS = 8_000;

const fetchIp = async (useFn: typeof fetch): Promise<string | null> => {
  try {
    const res = await useFn(IP_CHECK_URL, {
      signal: AbortSignal.timeout(IP_CHECK_TIMEOUT_MS),
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept: "application/json,text/plain,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    return data.ip ?? null;
  } catch (err) {
    logger.debug("settings", "public IP lookup failed", err);
    return null;
  }
};

const _applySchemaUpdates = (
  body: Record<string, string>,
): Record<string, string | boolean> => {
  const updates: Record<string, string | boolean> = {};
  for (const [key, def] of Object.entries(SETTINGS_SCHEMA)) {
    const raw = body[key];
    if (raw === undefined || typeof raw !== "string") continue;
    if (isListField(key)) continue;
    updates[key] = coerceSetting(def, raw);
  }
  return updates;
};

const _countLines = (text: string): number => {
  if (text.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++;
  }
  return lines;
};

const trimBigFields = (
  settings: Record<string, ServerSettingValue>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...settings };
  const oversized: Record<string, OversizedFieldInfo> = {};
  for (const key of LIST_FIELDS) {
    const value = settings[key];
    if (typeof value === "string" && value.length > MAX_INLINE_FIELD_CHARS) {
      oversized[key] = { chars: value.length, lines: _countLines(value) };
      out[key] = "";
    }
  }
  if (Object.keys(oversized).length > 0) out[OVERSIZED_FIELDS_KEY] = oversized;
  return out;
};

const _persistListFields = async (
  body: Record<string, string>,
): Promise<void> => {
  for (const key of LIST_FIELDS) {
    const raw = body[key];
    if (typeof raw === "string") await writeListField(key, raw);
  }
};

router.get("/api/settings/streaming", async (c) => {
  const settings = await getInstanceSettings();
  return c.json({
    enabled: asBoolean(settings.streamingEnabled),
    autoRetry: asBoolean(settings.streamingAutoRetry),
    maxRetries: parseInt(asString(settings.streamingMaxRetries) || "2", 10),
  });
});

router.get("/api/settings/languages", async (c) => {
  const settings = await getInstanceSettings();
  if (!asBoolean(settings["languagesEnabled"])) {
    return c.json({ languages: DEFAULT_LANGUAGES });
  }
  const raw = asString(settings["languages"] ?? "");
  const codes = raw
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2,3}$/.test(s));
  return c.json({ languages: codes.length > 0 ? codes : DEFAULT_LANGUAGES });
});

router.get("/api/settings/general", async (c) => {
  const denied = await guardSettingsRoute(c, "GET /api/settings/general");
  if (denied) return denied;
  const settings = await getInstanceSettings();
  const indexerLists = await readIndexerLists();
  const domainLists = await readDomainLists();
  return c.json(trimBigFields({ ...settings, ...indexerLists, ...domainLists }));
});

router.post("/api/settings/general", async (c) => {
  const denied = await guardSettingsRoute(c, "POST /api/settings/general");
  if (denied) return denied;
  const body = await readObjectBody<Record<string, string>>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  const existing = await getInstanceSettings();
  const updates = _applySchemaUpdates(body);
  await setInstanceSettings({ ...existing, ...updates });
  await _persistListFields(body);
  await syncBlocklist();
  return c.json({ ok: true });
});

router.post("/api/settings/field", async (c) => {
  const denied = await guardSettingsRoute(c, "POST /api/settings/field");
  if (denied) return denied;
  const body = await readObjectBody<{ key?: string; value?: string }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  const { key, value } = body;
  if (!key || typeof key !== "string" || !(key in SETTINGS_SCHEMA)) {
    return c.json({ error: "Unknown setting" }, 400);
  }
  if (value === undefined || typeof value !== "string") {
    return c.json({ error: "Invalid value" }, 400);
  }
  const coerced = coerceSetting(SETTINGS_SCHEMA[key as SettingKey], value);
  if (isListField(key)) {
    await writeListField(key, typeof coerced === "string" ? coerced : value);
  } else {
    await updateInstanceSettings({ [key]: coerced });
  }
  await syncBlocklist();
  return c.json({ ok: true });
});

router.post("/api/settings/domain-action", async (c) => {
  const denied = await guardSettingsRoute(
    c,
    "POST /api/settings/domain-action",
  );
  if (denied) return denied;

  type DomainActionBody = { kind?: string; source?: string; target?: string; score?: number };
  const body = await readObjectBody<DomainActionBody>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const kind = body.kind;
  const source = _normalizeHostname(body.source ?? "");
  if (!source) return c.json({ error: "Missing source" }, 400);

  const existing = await getInstanceSettings();
  const lists = await readDomainLists();

  if (kind === "block") {
    if (!asBoolean(existing.domainBlockUiEnabled)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await writeDomainList(
      "domainBlockList",
      _appendBlock(lists.domainBlockList, source),
    );
  } else if (kind === "replace") {
    if (!asBoolean(existing.domainReplaceUiEnabled)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const target = _normalizeHostname(body.target ?? "");
    if (!target) return c.json({ error: "Missing target" }, 400);
    await writeDomainList(
      "domainReplaceList",
      _appendReplace(lists.domainReplaceList, source, target),
    );
  } else if (kind === "score") {
    if (!asBoolean(existing.domainScoreUiEnabled)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const score = Number(body.score);
    if (!Number.isFinite(score)) {
      return c.json({ error: "Invalid score" }, 400);
    }
    await writeDomainList(
      "domainScoreList",
      _upsertScore(lists.domainScoreList, source, Math.trunc(score)),
    );
  } else {
    return c.json({ error: "Invalid kind" }, 400);
  }

  return c.json({ ok: true });
});

router.get("/api/settings/api-key", async (c) => {
  if (!isPasswordRequired()) return c.json({ error: "Forbidden" }, 403);
  const denied = await guardSettingsRoute(c, "GET /api/settings/api-key");
  if (denied) return denied;
  const settings = await getInstanceSettings();
  return c.json({
    key: getServerKeyHex() ?? "",
    searchEnabled: asBoolean(settings.apiKeySearchEnabled),
    suggestEnabled: asBoolean(settings.apiKeySuggestEnabled),
  });
});

router.post("/api/settings/api-key/regenerate", async (c) => {
  if (!isPasswordRequired()) return c.json({ error: "Forbidden" }, 403);
  const denied = await guardSettingsRoute(
    c,
    "POST /api/settings/api-key/regenerate",
  );
  if (denied) return denied;
  await regenerateServerKey();
  return c.json({ key: getServerKeyHex() ?? "" });
});

router.post("/api/settings/proxy-test", async (c) => {
  const denied = await guardSettingsRoute(c, "POST /api/settings/proxy-test");
  if (denied) return denied;

  const body = await readObjectBody<{ proxyEnabled?: string; proxyUrls?: string }>(c);

  let enabled: boolean;
  let proxyUrls: string;

  if (body) {
    enabled = asBoolean(body.proxyEnabled);
    proxyUrls = asString(body.proxyUrls);
  } else {
    const settings = await getInstanceSettings();
    enabled = asBoolean(settings.proxyEnabled);
    proxyUrls = asString(settings.proxyUrls);
  }

  const directIp = await fetchIp(fetch);

  if (!enabled || !proxyUrls.trim()) {
    return c.json({
      enabled: false,
      directIp,
      proxyIp: null,
      match: null,
    });
  }

  const overrideFetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
    outgoingFetch(
      String(_url),
      {
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        signal: init?.signal ?? undefined,
      },
      "fetch",
      {
        proxyOverrideEnabled: true,
        proxyOverrideUrls: proxyUrls,
      },
    )) as typeof fetch;
  const proxyIp = await fetchIp(overrideFetch);

  return c.json({
    enabled: true,
    directIp,
    proxyIp,
    match: directIp !== null && proxyIp !== null && directIp === proxyIp,
  });
});

router.get("/api/settings/honeypot/blocklist", async (c) => {
  const denied = await guardSettingsRoute(
    c,
    "GET /api/settings/honeypot/blocklist",
  );
  if (denied) return denied;
  const settings = await getInstanceSettings();
  const banHours = resolveBanHours(settings.honeypotBanDuration);
  const entries = await listActive(banHours);
  return c.json({ entries, banHours });
});

router.post("/api/settings/honeypot/ban", async (c) => {
  const denied = await guardSettingsRoute(c, "POST /api/settings/honeypot/ban");
  if (denied) return denied;
  const body = await readObjectBody<{ ip?: string }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  const ip = (body.ip ?? "").trim();
  if (!ip) return c.json({ error: "Missing ip" }, 400);
  await addEntry(ip);
  return c.json({ ok: true });
});

router.post("/api/settings/honeypot/unban", async (c) => {
  const denied = await guardSettingsRoute(
    c,
    "POST /api/settings/honeypot/unban",
  );
  if (denied) return denied;
  const body = await readObjectBody<{ ip?: string }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  const ip = (body.ip ?? "").trim();
  if (!ip) return c.json({ error: "Missing ip" }, 400);
  await removeEntry(ip);
  return c.json({ ok: true });
});

router.get("/api/settings/appearance", async (c) => {
  const settings = await getInstanceSettings();
  return c.json({
    theme: asString(settings.defaultTheme) || "system",
  });
});

router.get("/api/settings/tab-order", async (c) => {
  const settings = await getInstanceSettings();
  const order = settings["engineTabsOrder"];
  return c.json({ engineTabsOrder: Array.isArray(order) ? order : [] });
});

router.post("/api/settings/tab-order", async (c) => {
  const denied = await guardSettingsRoute(c, "POST /api/settings/tab-order");
  if (denied) return denied;
  const body = await readObjectBody<{ engineTabsOrder?: unknown }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (
    !Array.isArray(body.engineTabsOrder) ||
    !body.engineTabsOrder.every((v) => typeof v === "string")
  ) {
    return c.json({ error: "engineTabsOrder must be a string array" }, 400);
  }
  await updateInstanceSettings({
    engineTabsOrder: body.engineTabsOrder as string[],
  });
  return c.json({ ok: true });
});

router.get("/api/settings/shortcuts", async (c) => {
  const denied = await guardSettingsRoute(c, "GET /api/settings/shortcuts");
  if (denied) return denied;
  const settings = await readShortcutsSettings();
  const states = await getShortcutDisabledStates();
  const custom = getShortcutActions().map((action) => ({
    ...action,
    disabled: states[action.id] ?? false,
  }));
  return c.json({ shortcuts: settings.bindings, custom });
});

router.post("/api/settings/shortcuts", async (c) => {
  const denied = await guardSettingsRoute(c, "POST /api/settings/shortcuts");
  if (denied) return denied;
  const body = await readObjectBody<{ shortcuts?: unknown }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  const shortcuts = await saveShortcutBindings(body.shortcuts, [
    ...SHORTCUT_ACTIONS,
    ...getShortcutActions(),
  ]);
  if (!shortcuts) {
    return c.json({ error: "Invalid shortcuts map" }, 400);
  }
  return c.json({ ok: true });
});

const SHORTCUT_SCAFFOLD = `export default {
  name: "My shortcut",
  description: "Describe what this shortcut does.",
  defaultBinding: { key: "k", alt: true },
  run(ctx) {
    const { document } = ctx;
    document.querySelector("#results-list a.result-title")?.focus();
  },
};
`;

router.get("/api/settings/shortcuts/scaffold", async (c) => {
  const denied = await guardSettingsRoute(c, "GET /api/settings/shortcuts/scaffold");
  if (denied) return denied;
  return c.json({ source: SHORTCUT_SCAFFOLD });
});

router.post("/api/settings/shortcuts/source", async (c) => {
  const denied = await guardSettingsRoute(c, "POST /api/settings/shortcuts/source");
  if (denied) return denied;
  const body = await readObjectBody<{ name?: unknown; source?: unknown }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (typeof body.name !== "string" || typeof body.source !== "string") {
    return c.json({ error: "Invalid shortcut source" }, 400);
  }
  const base = slugifyIdPart(body.name);
  const id = makeExtID(base, "shortcut");
  const target = `${shortcutsDir()}/${id}.js`;
  await mkdir(shortcutsDir(), { recursive: true });
  const overwrite = await stat(target).then(() => true).catch(() => false);
  if (overwrite) {
    logger.info("settings", `shortcut source overwritten id=${id}`);
  }
  await writeFile(target, body.source, "utf-8");
  await reloadShortcutsRegistry(true);
  return c.json({ ok: true, id, overwrite });
});

router.delete("/api/settings/shortcuts/source/:id", async (c) => {
  const denied = await guardSettingsRoute(c, "DELETE /api/settings/shortcuts/source/:id");
  if (denied) return denied;
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const file = getEditableShortcutFile(id);
  if (!file) return c.json({ error: "Shortcut is not editable" }, 403);
  const settings = await readShortcutsSettings();
  delete settings.bindings[id];
  await writeShortcutsSettings(settings);
  try {
    await unlink(file);
  } catch (err) {
    logger.warn("settings", `failed to unlink shortcut source id=${id}`, err);
  }
  await reloadShortcutsRegistry(true);
  return c.json({ ok: true });
});

router.get("/api/settings/default-engines", async (c) => {
  const denied = await guardSettingsRoute(
    c,
    "GET /api/settings/default-engines",
  );
  if (denied) return denied;
  try {
    const raw = await readFile(defaultEnginesFile(), "utf-8");
    return c.json(JSON.parse(raw));
  } catch (err) {
    logger.debug("settings", "default engines file read failed", err);
    return c.json({});
  }
});

router.post("/api/settings/default-engines", async (c) => {
  const denied = await guardSettingsRoute(
    c,
    "POST /api/settings/default-engines",
  );
  if (denied) return denied;
  const body = await readObjectBody<Record<string, boolean>>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  await writeFile(defaultEnginesFile(), JSON.stringify(body, null, 2), "utf-8");
  return c.json({ ok: true });
});

export default router;
