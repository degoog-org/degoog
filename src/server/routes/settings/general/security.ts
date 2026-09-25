import { Hono, type Context } from "hono";
import { asBoolean } from "../../../utils/settings/plugin-settings";
import { getServerKeyHex, regenerateServerKey } from "../../../utils/security/server-key";
import { resolveBanHours } from "../../../utils/security/bot-trap";
import { addEntry, listActive, removeEntry } from "../../../utils/filtering/blocklist";
import { guardSettingsRoute, isPasswordRequired } from "../settings-auth";
import { readObjectBody } from "../../../utils/hono";
import { getInstanceSettings } from "../../../utils/settings/server-settings";
import { settingsLock } from "../../../utils/settings/settings-write";
import { settingsAuth } from "../../_guards";

const router = new Hono();

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
  await settingsLock(regenerateServerKey);
  return c.json({ key: getServerKeyHex() ?? "" });
});

router.get("/api/settings/honeypot/blocklist", settingsAuth("GET /api/settings/honeypot/blocklist"), async (c) => {
  const settings = await getInstanceSettings();
  const banHours = resolveBanHours(settings.honeypotBanDuration);
  const entries = await listActive(banHours);
  return c.json({ entries, banHours });
});

const _blocklistEdit = (edit: (ip: string) => Promise<void>) => async (c: Context) => {
  const body = await readObjectBody<{ ip?: string }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  const ip = (body.ip ?? "").trim();
  if (!ip) return c.json({ error: "Missing ip" }, 400);
  await edit(ip);
  return c.json({ ok: true });
};

router.post(
  "/api/settings/honeypot/ban",
  settingsAuth("POST /api/settings/honeypot/ban"),
  _blocklistEdit((ip) => addEntry(ip)),
);

router.post(
  "/api/settings/honeypot/unban",
  settingsAuth("POST /api/settings/honeypot/unban"),
  _blocklistEdit((ip) => removeEntry(ip)),
);

export default router;
