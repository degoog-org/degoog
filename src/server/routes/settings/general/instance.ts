import { readFile, writeFile } from "fs/promises";
import { Hono } from "hono";
import { defaultEnginesFile } from "../../../utils/paths";
import { asBoolean, asString } from "../../../utils/settings/plugin-settings";
import { DEFAULT_LANGUAGES } from "../../../utils/search";
import { syncBlocklist } from "../../../utils/security/bot-trap";
import { readObjectBody } from "../../../utils/hono";
import {
  getInstanceSettings,
  updateInstanceSettings,
} from "../../../utils/settings/server-settings";
import { writeSyncedDefaults } from "../../../utils/settings/synced-settings";
import { COMPAT_SETTING_KEYS } from "../../../extensions/compatibility-layer/registry";
import {
  SETTINGS_SCHEMA,
  coerceSetting,
  type SettingKey,
} from "../../../utils/settings/settings-schema";
import {
  applySettingsBatch,
  isListField,
  reconcileIndexerQueue,
  reloadCompat,
  savedBody,
  writeListField,
  settingsLock,
} from "../../../utils/settings/settings-write";
import { readIndexerLists } from "../../../indexer/config/lists";
import { readDomainLists } from "../../../utils/filtering/domain-lists";
import { logger } from "../../../utils/logger";
import { getRestartState } from "../../../utils/extension-support/restart-state";
import { requestRestart } from "../../../utils/server-lifecycle";
import { settingsAuth } from "../../_guards";
import { trimBigFields } from "./trim-big-fields";

const router = new Hono();

router.get("/api/settings/streaming", async (c) => {
  const settings = await getInstanceSettings();
  return c.json({
    enabled: asBoolean(settings.streamingEnabled),
    autoRetry: asBoolean(settings.streamingAutoRetry),
    maxRetries: parseInt(asString(settings.streamingMaxRetries) || "2", 10),
    disabledTypes: asString(settings.streamingDisabledTypes ?? "").split("\n").map(s => s.trim()).filter(Boolean),
    infiniteScroll: asBoolean(settings.infiniteScrollEnabled),
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

router.get("/api/settings/general", settingsAuth("GET /api/settings/general"), async (c) => {
  const settings = await getInstanceSettings();
  const indexerLists = await readIndexerLists();
  const domainLists = await readDomainLists();
  return c.json(trimBigFields({ ...settings, ...indexerLists, ...domainLists }));
});

router.post("/api/settings/general", settingsAuth("POST /api/settings/general"), async (c) => {
  const body = await readObjectBody<Record<string, string>>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  return c.json(await applySettingsBatch(body));
});

router.post("/api/settings/field", settingsAuth("POST /api/settings/field"), async (c) => {
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
  await settingsLock(async () => {
    if (isListField(key)) {
      await writeListField(key, typeof coerced === "string" ? coerced : value);
    } else {
      await updateInstanceSettings({ [key]: coerced });
    }
  });
  await syncBlocklist();
  const indexerUp =
    key === "degoogIndexerEnabled" ? await reconcileIndexerQueue() : true;
  const reloaded = COMPAT_SETTING_KEYS.includes(key) ? await reloadCompat() : true;
  return c.json(savedBody(reloaded, indexerUp));
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

router.post("/api/settings/tab-order", settingsAuth("POST /api/settings/tab-order"), async (c) => {
  const body = await readObjectBody<{ engineTabsOrder?: unknown }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (
    !Array.isArray(body.engineTabsOrder) ||
    !body.engineTabsOrder.every((v) => typeof v === "string")
  ) {
    return c.json({ error: "engineTabsOrder must be a string array" }, 400);
  }
  await settingsLock(async () => {
    await updateInstanceSettings({
      engineTabsOrder: body.engineTabsOrder as string[],
    });
  });
  return c.json({ ok: true });
});

router.post("/api/settings/sync", settingsAuth("POST /api/settings/sync"), async (c) => {
  const body = await readObjectBody<{ settings?: unknown }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (!body.settings || typeof body.settings !== "object" || Array.isArray(body.settings)) {
    return c.json({ error: "Missing settings" }, 400);
  }
  if (JSON.stringify(body.settings).length > 64_000) {
    return c.json({ error: "Settings too large" }, 413);
  }
  const settings = await writeSyncedDefaults(body.settings as Record<string, unknown>);
  return c.json({ ok: true, settings });
});

router.get("/api/settings/default-engines", settingsAuth("GET /api/settings/default-engines"), async (c) => {
  try {
    const raw = await readFile(defaultEnginesFile(), "utf-8");
    return c.json(JSON.parse(raw));
  } catch (err) {
    logger.debug("settings", "default engines file read failed", err);
    return c.json({});
  }
});

router.post("/api/settings/default-engines", settingsAuth("POST /api/settings/default-engines"), async (c) => {
  const body = await readObjectBody<Record<string, boolean>>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  await writeFile(defaultEnginesFile(), JSON.stringify(body, null, 2), "utf-8");
  return c.json({ ok: true });
});

router.get("/api/settings/restart-state", settingsAuth("GET /api/settings/restart-state"), async (c) => {
  return c.json(getRestartState());
});

router.post("/api/settings/restart", settingsAuth("POST /api/settings/restart"), async (c) => {
  requestRestart("admin-triggered restart from general settings");
  return c.json({ ok: true });
});

export default router;
