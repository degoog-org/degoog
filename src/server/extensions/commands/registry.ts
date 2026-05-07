import { join } from "path";
import type {
  BangCommand,
  ExtensionMeta,
  SettingField,
  Translate,
} from "../../types";
import {
  initPlugin,
  loadPluginAssets,
  lockinNameSpace,
} from "../../utils/plugin-assets";
import {
  asString,
  getSettings,
  isDisabled,
  maskSecrets,
} from "../../utils/plugin-settings";
import { createTranslatorFromPath } from "../../utils/translation";
import { getEngineMap as getSearchEngineMap } from "../engines/registry";
import { pluginsDir } from "../../utils/paths";
import { createRegistry } from "../registry-factory";
import { extensionReadmeExists } from "../../utils/extension-docs";

const builtinsDir = join(
  process.cwd(),
  "src",
  "server",
  "extensions",
  "commands",
  "builtins",
);

interface CommandEntry {
  id: string;
  trigger: string;
  displayName: string;
  instance: BangCommand;
}

let userAliases: Record<string, string> = {};

function getEngineShortcuts(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, engine] of Object.entries(getSearchEngineMap())) {
    if (engine.bangShortcut) map.set(engine.bangShortcut, id);
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

const commandSourceMap = new Map<string, "builtin" | "plugin">();

const registry = createRegistry<CommandEntry>({
  dirs: () => [
    { dir: builtinsDir, source: "builtin" },
    { dir: pluginsDir(), source: "plugin" },
  ],
  match: (mod) => {
    const Export = mod.default ?? mod.command ?? mod.Command;
    const instance: BangCommand =
      typeof Export === "function"
        ? new (Export as new () => BangCommand)()
        : (Export as BangCommand);
    if (!isBangCommand(instance)) return null;
    if (registry.items().some((c) => c.trigger === instance.trigger))
      return null;
    return {
      id: "",
      trigger: instance.trigger,
      displayName: instance.name,
      instance,
    };
  },
  onLoad: async (entry, { entryPath, folderName, source }) => {
    entry.id = (source === "plugin" ? "plugin-" : "") + folderName;
    commandSourceMap.set(entry.id, source);
    entry.instance.t = await createTranslatorFromPath(entryPath);
    lockinNameSpace(folderName, `commands/${entry.id}`);
    if (!(await isDisabled(entry.id))) {
      const template = await loadPluginAssets(
        entryPath,
        folderName,
        entry.id,
        source,
      );
      await initPlugin(entry.instance, entryPath, entry.id, template);
    }
  },
  debugTag: "commands",
});

export async function initPlugins(): Promise<void> {
  const { readFile } = await import("fs/promises");
  const { aliasesFile } = await import("../../utils/paths");

  try {
    const raw = await readFile(aliasesFile(), "utf-8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      userAliases = parsed as Record<string, string>;
    }
  } catch {
    userAliases = {};
  }

  commandSourceMap.clear();
  await registry.init();
}

export async function reloadCommands(): Promise<void> {
  await initPlugins();
}

export function getCommandSource(id: string): "builtin" | "plugin" {
  return commandSourceMap.get(id) ?? "plugin";
}

export function getCommandInstanceById(id: string): BangCommand | undefined {
  return registry.items().find((c) => c.id === id)?.instance;
}

export function getAllCommandTranslators(): {
  namespace: string;
  translator: Translate;
}[] {
  return registry
    .items()
    .filter((c) => !!c.instance.t)
    .map((c) => ({ namespace: `commands/${c.id}`, translator: c.instance.t! }));
}

export function getCommandMap(): Map<
  string,
  { instance: BangCommand; id: string }
> {
  const map = new Map<string, { instance: BangCommand; id: string }>();
  for (const cmd of registry.items()) {
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

export function setCommandsLocale(locale: string): void {
  for (const entry of registry.items()) {
    entry.instance.t?.setLocale(locale);
  }
}

export function getCommandRegistry(): CommandRegistryEntry[] {
  const entries: CommandRegistryEntry[] = registry.items().map((c) => {
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
      entries.push({
        trigger: shortcut,
        name: `${engine.name} only`,
        description: `Search only ${engine.name}`,
        aliases: [],
        category: "Engine shortcuts",
      });
    }
  }

  return entries;
}

export async function getFilteredCommandRegistry(): Promise<
  CommandRegistryEntry[]
> {
  const full = getCommandRegistry();
  const configuredTriggers = new Set<string>();

  await Promise.all(
    registry.items().map(async (entry) => {
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
  field: SettingField,
): SettingField[] {
  if (schema.some((f) => f.key === "naturalLanguage")) return schema;
  const hasPhrases =
    Array.isArray(naturalLanguagePhrases) && naturalLanguagePhrases.length > 0;
  if (!hasPhrases) return schema;
  return [...schema, field];
}

export async function getPluginExtensionMeta(
  coreT?: Translate,
): Promise<ExtensionMeta[]> {
  const results: ExtensionMeta[] = [];
  const middlewareSettings = await getSettings("middleware");

  const naturalLangField: SettingField = coreT
    ? {
        ...NATURAL_LANGUAGE_FIELD,
        label:
          coreT("settings-page.schema.natural-language.label") ||
          NATURAL_LANGUAGE_FIELD.label,
        description:
          coreT("settings-page.schema.natural-language.description") ||
          NATURAL_LANGUAGE_FIELD.description,
      }
    : NATURAL_LANGUAGE_FIELD;

  for (const entry of registry.items()) {
    const baseSchema = entry.instance.settingsSchema ?? [];
    const schema = schemaWithNaturalLanguage(
      baseSchema,
      entry.instance.naturalLanguagePhrases,
      naturalLangField,
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
    const t = entry.instance.t;
    const nameKey = `${entry.id}.name`;
    const descKey = `${entry.id}.description`;
    const translatedName = t ? t(nameKey) : nameKey;
    const translatedDesc = t ? t(descKey) : descKey;
    const translatedSchema = t
      ? schema.map((field) => {
          const base = `${entry.id}.settings.${field.key}`;
          const label = t(`${base}.label`);
          const desc =
            field.description !== undefined
              ? t(`${base}.description`)
              : undefined;
          const placeholder =
            field.placeholder !== undefined
              ? t(`${base}.placeholder`)
              : undefined;
          return {
            ...field,
            label: label !== `${base}.label` ? label : field.label,
            ...(desc !== undefined && desc !== `${base}.description`
              ? { description: desc }
              : {}),
            ...(placeholder !== undefined &&
            placeholder !== `${base}.placeholder`
              ? { placeholder }
              : {}),
          };
        })
      : schema;
    const meta: ExtensionMeta = {
      id: entry.id,
      displayName:
        translatedName !== nameKey ? translatedName : entry.displayName,
      description:
        translatedDesc !== descKey
          ? translatedDesc
          : entry.instance.description,
      type: "command",
      configurable: schema.length > 0,
      settingsSchema: translatedSchema,
      settings: maskedSettings,
      source: commandSourceMap.get(entry.id) ?? "plugin",
    };
    const { exists } = await extensionReadmeExists(entry.id);
    meta.extensionDocsAvailable = exists;
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
  const cmdEntry = map.get(lowerTrigger);
  if (cmdEntry)
    return {
      type: "command",
      command: cmdEntry.instance,
      commandId: cmdEntry.id,
      args,
    };

  const engineId = getEngineShortcuts().get(lowerTrigger);
  if (engineId) return { type: "engine", engineId, query: args };

  return null;
}
