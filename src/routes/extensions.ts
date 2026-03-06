import { Hono } from "hono";
import { getEngineExtensionMeta, getEngineMap } from "../engines/registry";
import {
  getPluginExtensionMeta,
  getCommandInstanceById,
} from "../commands/registry";
import { getSlotPlugins, getSlotPluginById } from "../slots/registry";
import { getThemeExtensionMeta } from "../themes/registry";
import { getSettings, setSettings, mergeSecrets, maskSecrets } from "../plugin-settings";
import {
  generateAISummary,
  AI_SUMMARY_ID,
} from "../commands/builtins/ai-summary";
import type { ScoredResult, ExtensionMeta } from "../types";

const router = new Hono();

async function getSlotExtensionMeta(): Promise<ExtensionMeta[]> {
  const slots = getSlotPlugins();
  const out: ExtensionMeta[] = [];
  for (const slot of slots) {
    const schema = slot.settingsSchema ?? [];
    if (schema.length === 0) continue;
    const id = `slot-${slot.id}`;
    const raw = await getSettings(id);
    const settings = maskSecrets(raw, schema);
    out.push({
      id,
      displayName: slot.name,
      description: `Shows above results when query matches (e.g. “… cast”).`,
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
  const body = await c.req.json<Record<string, string>>();

  const [engines, plugins, slotMeta, themes] = await Promise.all([
    getEngineExtensionMeta(),
    getPluginExtensionMeta(),
    getSlotExtensionMeta(),
    getThemeExtensionMeta(),
  ]);
  const ext = [...engines, ...plugins, ...slotMeta, ...themes].find((e) => e.id === id);

  if (!ext) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const schemaKeys = new Set(ext.settingsSchema.map((f) => f.key));
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (schemaKeys.has(key) && typeof value === "string") {
      filtered[key] = value;
    }
  }

  const existing = await getSettings(id);
  const merged = mergeSecrets(filtered, existing, ext.settingsSchema);
  await setSettings(id, merged);

  const engineInstance = getEngineMap()[id];
  if (engineInstance?.configure) engineInstance.configure(merged);

  const commandInstance = getCommandInstanceById(id);
  if (commandInstance?.configure) commandInstance.configure(merged);

  if (id.startsWith("slot-")) {
    const slotPlugin = getSlotPluginById(id.slice(5));
    if (slotPlugin?.configure) slotPlugin.configure(merged);
  }

  return c.json({ ok: true });
});

router.post("/api/ai/glance", async (c) => {
  const body = await c.req.json<{ query: string; results: ScoredResult[] }>();
  if (!body.query || !Array.isArray(body.results)) {
    return c.json({ error: "Missing query or results" }, 400);
  }

  const aiSettings = await getSettings(AI_SUMMARY_ID);
  if (aiSettings["enabled"] !== "true") {
    return c.json({ summary: null });
  }

  const summary = await generateAISummary(body.query, body.results);
  return c.json({ summary });
});

export default router;
