import { join } from "path";
import type { SlotPlugin, SlotPanelPosition, PluginContext } from "../types";
import { getSettings, settingsAsStrings } from "../plugin-settings";
import { addPluginCss, registerPluginScript } from "../plugin-assets";
import { debug } from "../logger";

let slotPlugins: SlotPlugin[] = [];
const builtinsDir = join(process.cwd(), "src", "commands", "builtins");

function isSlotPlugin(val: unknown): val is SlotPlugin {
  return (
    typeof val === "object" &&
    val !== null &&
    "id" in val &&
    typeof (val as SlotPlugin).id === "string" &&
    "name" in val &&
    typeof (val as SlotPlugin).name === "string" &&
    "position" in val &&
    ["above-results", "below-results", "sidebar", "at-a-glance"].includes(
      (val as SlotPlugin).position as SlotPanelPosition,
    ) &&
    "trigger" in val &&
    typeof (val as SlotPlugin).trigger === "function" &&
    "execute" in val &&
    typeof (val as SlotPlugin).execute === "function"
  );
}

async function loadSlotsFromRoot(
  rootDir: string,
  source: "plugin" | "builtin",
): Promise<void> {
  const { readdir, readFile, stat } = await import("fs/promises");
  const { join } = await import("path");
  const { pathToFileURL } = await import("url");
  let entries: string[];
  try {
    entries = await readdir(rootDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryPath = join(rootDir, entry);
    const entryStat = await stat(entryPath).catch(() => null);
    if (!entryStat?.isDirectory()) continue;

    let indexFile: string | undefined;
    for (const f of ["index.js", "index.ts", "index.mjs", "index.cjs"]) {
      const s = await stat(join(entryPath, f)).catch(() => null);
      if (s?.isFile()) {
        indexFile = f;
        break;
      }
    }
    if (!indexFile) continue;

    try {
      const fullPath = join(entryPath, indexFile);
      const url = pathToFileURL(fullPath).href;
      const mod = await import(url);
      const slot = mod.slot ?? mod.slotPlugin ?? mod.default?.slot;
      if (!slot || !isSlotPlugin(slot)) continue;

      const slotSettingsId = slot.settingsId ?? `slot-${slot.id}`;
      const template = await readFile(join(entryPath, "template.html"), "utf-8").catch(() => "");
      const css = await readFile(join(entryPath, "style.css"), "utf-8").catch(() => "");
      if (css) addPluginCss(slotSettingsId, css);
      const hasScript = await stat(join(entryPath, "script.js")).catch(() => null);
      if (hasScript?.isFile()) registerPluginScript(entry, source);

      if (slot.init) {
        const ctx: PluginContext = {
          dir: entryPath,
          template,
          readFile: (filename: string) => readFile(join(entryPath, filename), "utf-8"),
        };
        await Promise.resolve(slot.init(ctx));
      }

      if (slot.settingsSchema?.length && slot.configure) {
        try {
          const stored = await getSettings(slotSettingsId);
          if (Object.keys(stored).length > 0) slot.configure(settingsAsStrings(stored));
        } catch (err) {
          debug("slots", `Failed to configure slot plugin: ${slot.id}`, err);
        }
      }
      slotPlugins.push(slot);
    } catch (err) {
      debug("slots", `Failed to load slot plugin: ${entry}`, err);
    }
  }
}

export async function initSlotPlugins(): Promise<void> {
  const { join } = await import("path");
  const pluginDir =
    process.env.DEGOOG_PLUGINS_DIR ?? join(process.cwd(), "data", "plugins");
  slotPlugins = [];
  await loadSlotsFromRoot(builtinsDir, "builtin");
  await loadSlotsFromRoot(pluginDir, "plugin");
}

export function getSlotPlugins(): SlotPlugin[] {
  return [...slotPlugins];
}

export function getSlotPluginById(slotId: string): SlotPlugin | null {
  return slotPlugins.find((p) => p.id === slotId) ?? null;
}

export async function reloadSlotPlugins(): Promise<void> {
  slotPlugins = [];
  await initSlotPlugins();
}
