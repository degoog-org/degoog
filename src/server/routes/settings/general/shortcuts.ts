import { mkdir, stat, unlink, writeFile } from "fs/promises";
import { Hono } from "hono";
import { shortcutsDir } from "../../../utils/paths";
import { readObjectBody } from "../../../utils/hono";
import { SHORTCUT_ACTIONS } from "../../../../shared/shortcuts";
import {
  getEditableShortcutFile,
  getShortcutActions,
  getShortcutDisabledStates,
} from "../../../extensions/shortcuts/registry";
import { makeExtID, slugifyIdPart } from "../../../utils/extension-support/extension-id";
import {
  readShortcutsSettings,
  writeShortcutsSettings,
  saveShortcutBindings,
} from "../../../utils/settings/shortcuts-settings";
import { ExtensionStoreType } from "../../../types/extension";
import { ReloadMode, reloadSync } from "../../../extensions/store/reload-sync";
import { logger } from "../../../utils/logger";
import { settingsAuth } from "../../_guards";

const router = new Hono();

router.get("/api/settings/shortcuts", settingsAuth("GET /api/settings/shortcuts"), async (c) => {
  const settings = await readShortcutsSettings();
  const states = await getShortcutDisabledStates();
  const custom = getShortcutActions().map((action) => ({
    ...action,
    disabled: states[action.id] ?? false,
  }));
  return c.json({ shortcuts: settings.bindings, custom });
});

router.post("/api/settings/shortcuts", settingsAuth("POST /api/settings/shortcuts"), async (c) => {
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

router.get("/api/settings/shortcuts/scaffold", settingsAuth("GET /api/settings/shortcuts/scaffold"), async (c) => {
  return c.json({ source: SHORTCUT_SCAFFOLD });
});

router.post("/api/settings/shortcuts/source", settingsAuth("POST /api/settings/shortcuts/source"), async (c) => {
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
  await reloadSync(ExtensionStoreType.Shortcut, ReloadMode.Bust);
  return c.json({ ok: true, id, overwrite });
});

router.delete("/api/settings/shortcuts/source/:id", settingsAuth("DELETE /api/settings/shortcuts/source/:id"), async (c) => {
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
  await reloadSync(ExtensionStoreType.Shortcut, ReloadMode.Bust);
  return c.json({ ok: true });
});

export default router;
