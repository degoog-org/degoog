import { join } from "path";
import type {
  BangCommand,
  ExtensionMeta,
  SettingField,
  Translate,
} from "../../types";
import { debug } from "../../utils/logger";
import {
  initPlugin,
  loadPluginAssets,
  registerPluginNamespace,
} from "../../utils/plugin-assets";
import {
  asString,
  getSettings,
  isDisabled,
  maskSecrets,
} from "../../utils/plugin-settings";
import { createTranslatorFromPath } from "../../utils/translation";
import { getEngineMap as getSearchEngineMap } from "../engines/registry";

interface CommandEntry {
  id: string;
  trigger: string;
  displayName: string;
  instance: BangCommand;
}

const builtinsDir = join(
  process.cwd(),
  "src",
  "server",
  "extensions",
  "commands",
  "builtins",
);
let allCommands: CommandEntry[] = [];
let userAliases: Record<string, string> = {};

function getEngineShortcuts(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, engine] of Object.entries(getSearchEngineMap())) {
    if (engine.bangShortcut) {
      map.set(engine.bangShortcut, id);
    }
  }
  return map;
}

function isBangCommand(val: unknown): val is BangCommand {
  return (
    typeof val === "object" &&
    val !== null &&
    "name" in val &&
    typeof (val as BangCommand).name === "string" &&
    "trigger" in val &&
    typeof (val as BangCommand).trigger === "string" &&
    "execute" in val &&
    typeof (val as BangCommand).execute === "function"
  );
}

async function loadCommandsFromRoot(
  rootDir: string,
  idPrefix: string,
  source: "plugin" | "builtin",
): Promise<void> {
  const { readdir, stat } = await import("fs/promises");
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

    const id = idPrefix + entry;

    try {
      const fullPath = join(entryPath, indexFile);
      const url = pathToFileURL(fullPath).href;
      const mod = await import(url);

      const Export = mod.default ?? mod.command ?? mod.Command;

      const instance: BangCommand =
        typeof Export === "function" ? new Export() : Export;

      if (!isBangCommand(instance)) continue;
      if (allCommands.some((c) => c.trigger === instance.trigger)) continue;

      instance.t = await createTranslatorFromPath(entryPath);
      registerPluginNamespace(entry, `commands/${id}`);

      if (!(await isDisabled(id))) {
        const template = await loadPluginAssets(entryPath, entry, id, source);
        await initPlugin(instance, entryPath, id, template);
      }

      allCommands.push({
        id,
        trigger: instance.trigger,
        displayName: instance.name,
        instance,
      });
    } catch (err) {
      console.error(`Failed to load command: ${entry}`, err);
      debug("commands", `Failed to load command: ${entry}`, err);
    }
  }
}

export async function initPlugins(): Promise<void> {
  const { readFile } = await import("fs/promises");
  const { pluginsDir, aliasesFile } = await import("../../utils/paths");
  const commandDir = pluginsDir();
  allCommands = [];

  try {
    const aliasPath = aliasesFile();
    const raw = await readFile(aliasPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      userAliases = parsed as Record<string, string>;
    }
  } catch (err) {
    debug("commands", "Failed to load user aliases", err);
    userAliases = {};
  }

  await loadCommandsFromRoot(builtinsDir, "", "builtin");
  await loadCommandsFromRoot(commandDir, "plugin-", "plugin");
}

export async function reloadCommands(): Promise<void> {
  await initPlugins();
}

export function getCommandInstanceById(id: string): BangCommand | undefined {
  return allCommands.find((c) => c.id === id)?.instance;
}

export function getAllCommandTranslators(): {
  namespace: string;
  translator: Translate;
}[] {
  return allCommands
    .filter((c) => !!c.instance.t)
    .map((c) => ({ namespace: `commands/${c.id}`, translator: c.instance.t! }));
}

export function getCommandMap(): Map<
  string,
  { instance: BangCommand; id: string }
> {
  const map = new Map<string, { instance: BangCommand; id: string }>();
  for (const cmd of allCommands) {
    map.set(cmd.trigger, { instance: cmd.instance, id: cmd.id });
    for (const alias of cmd.instance.aliases ?? []) {
      map.set(alias, { instance: cmd.instance, id: cmd.id });
    }
  }
  for (const [alias, cmd] of Object.entries(userAliases)) {
    if (!map.has(alias)) {
      const target = map.get(cmd);
      if (target) map.set(alias, target);
    }
  }
  return map;
}

export type CommandRegistryEntry = {
  id?: string;
  trigger: string;
  name: string;
  description: string;
  aliases: string[];
  naturalLanguagePhrases?: string[];
  category?: string;
};

export function getCommandRegistry(): CommandRegistryEntry[] {
  const all = allCommands;
  const registry: CommandRegistryEntry[] = all.map((c) => {
    const builtinAliases = c.instance.aliases ?? [];
    const extraAliases = Object.entries(userAliases)
      .filter(([, target]) => target === c.trigger)
      .map(([alias]) => alias);
    const phrases = c.instance.naturalLanguagePhrases;
    const category = c.id.startsWith("plugin-") ? "Plugins" : "Built-in";
    return {
      id: c.id,
      trigger: c.instance.trigger,
      name: c.instance.name,
      description: c.instance.description,
      aliases: [...builtinAliases, ...extraAliases],
      category,
      ...(phrases && phrases.length > 0
        ? { naturalLanguagePhrases: phrases }
        : {}),
    };
  });

  for (const [shortcut, engineId] of getEngineShortcuts()) {
    const engine = getSearchEngineMap()[engineId];
    if (engine) {
      registry.push({
        trigger: shortcut,
        name: `${engine.name} only`,
        description: `Search only ${engine.name}`,
        aliases: [],
        category: "Engine shortcuts",
      });
    }
  }

  return registry;
}

export async function getFilteredCommandRegistry(): Promise<
  CommandRegistryEntry[]
> {
  const full = getCommandRegistry();
  const all = allCommands;

  const configuredTriggers = new Set<string>();
  await Promise.all(
    all.map(async (entry) => {
      if (await isDisabled(entry.id)) return;
      const configured = entry.instance.isConfigured
        ? await entry.instance.isConfigured()
        : true;
      if (configured) configuredTriggers.add(entry.instance.trigger);
    }),
  );

  for (const [shortcut] of getEngineShortcuts()) {
    configuredTriggers.add(shortcut);
  }

  return full.filter((c) => configuredTriggers.has(c.trigger));
}

export type CommandApiEntry = CommandRegistryEntry & {
  naturalLanguage: boolean;
};

export async function getCommandsApiResponse(): Promise<{
  commands: CommandApiEntry[];
}> {
  const full = await getFilteredCommandRegistry();
  const commands: CommandApiEntry[] = await Promise.all(
    full.map(async (entry) => {
      const naturalLanguage = entry.id
        ? (await getSettings(entry.id)).naturalLanguage === "true"
        : false;
      return { ...entry, naturalLanguage };
    }),
  );
  return { commands };
}

const NATURAL_LANGUAGE_FIELD: SettingField = {
  key: "naturalLanguage",
  label: "Natural language",
  type: "toggle",
  description:
    "When on, typing the trigger or phrase without ! runs the command and shows search results below.",
};

function schemaWithNaturalLanguage(
  schema: SettingField[],
  naturalLanguagePhrases: string[] | undefined,
): SettingField[] {
  if (schema.some((f) => f.key === "naturalLanguage")) return schema;
  const hasPhrases =
    Array.isArray(naturalLanguagePhrases) && naturalLanguagePhrases.length > 0;
  if (!hasPhrases) return schema;
  return [...schema, NATURAL_LANGUAGE_FIELD];
}

export async function getPluginExtensionMeta(): Promise<ExtensionMeta[]> {
  const results: ExtensionMeta[] = [];
  const middlewareSettings = await getSettings("middleware");

  for (const entry of allCommands) {
    const baseSchema = entry.instance.settingsSchema ?? [];
    const schema = schemaWithNaturalLanguage(
      baseSchema,
      entry.instance.naturalLanguagePhrases,
    );
    let rawSettings = await getSettings(entry.id);
    if (
      entry.id.startsWith("plugin-") &&
      baseSchema.some((f) => f.key === "useAsSettingsGate")
    ) {
      const slug = entry.id.slice(7);
      if (
        asString(middlewareSettings.settingsGate).trim() === `plugin:${slug}`
      ) {
        rawSettings = { ...rawSettings, useAsSettingsGate: "true" };
      }
    }
    const maskedSettings = maskSecrets(rawSettings, schema);
    if (rawSettings["disabled"])
      maskedSettings["disabled"] = rawSettings["disabled"];
    const meta: ExtensionMeta = {
      id: entry.id,
      displayName: entry.displayName,
      description: entry.instance.description,
      type: "command",
      configurable: schema.length > 0,
      settingsSchema: schema,
      settings: maskedSettings,
    };
    const inst = entry.instance as unknown as Record<string, unknown>;
    if (Array.isArray(inst.defaultFeedUrls)) {
      meta.defaultFeedUrls = inst.defaultFeedUrls as string[];
    }
    results.push(meta);
  }

  return results;
}

export type BangMatch =
  | { type: "command"; command: BangCommand; commandId: string; args: string }
  | { type: "engine"; engineId: string; query: string };

export function matchBangCommand(query: string): BangMatch | null {
  const trimmed = query.trim();
  if (!trimmed.startsWith("!")) return null;
  const withoutBang = trimmed.slice(1);
  const spaceIdx = withoutBang.indexOf(" ");
  const trigger =
    spaceIdx === -1 ? withoutBang : withoutBang.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : withoutBang.slice(spaceIdx + 1);
  const lowerTrigger = trigger.toLowerCase();

  const map = getCommandMap();
  const entry = map.get(lowerTrigger);
  if (entry)
    return {
      type: "command",
      command: entry.instance,
      commandId: entry.id,
      args,
    };

  const engineId = getEngineShortcuts().get(lowerTrigger);
  if (engineId) return { type: "engine", engineId, query: args };

  return null;
}
