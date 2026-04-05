const pluginCss = new Map<string, string>();
const scriptFolderSource = new Map<string, "plugin" | "builtin">();
const folderSettingsIds = new Map<string, Set<string>>();
const folderNamespaces = new Map<string, string>();

export function addPluginCss(id: string, css: string): void {
  pluginCss.set(id, css);
}

export function registerPluginScript(
  folderName: string,
  source: "plugin" | "builtin" = "plugin",
  settingsId?: string,
): void {
  scriptFolderSource.set(folderName, source);
  if (settingsId) {
    const existing = folderSettingsIds.get(folderName) ?? new Set();
    existing.add(settingsId);
    folderSettingsIds.set(folderName, existing);
  }
}

export function registerPluginNamespace(
  folderName: string,
  namespace: string,
): void {
  folderNamespaces.set(folderName, namespace);
}

export function getPluginNamespace(folderName: string): string | null {
  return folderNamespaces.get(folderName) ?? null;
}

export function registerPluginSettingsId(
  folderName: string,
  settingsId: string,
): void {
  const existing = folderSettingsIds.get(folderName) ?? new Set();
  existing.add(settingsId);
  folderSettingsIds.set(folderName, existing);
}

export function getPluginSettingsIds(folderName: string): string[] {
  return [...(folderSettingsIds.get(folderName) ?? [])];
}

export function getAllPluginCss(): string {
  return Array.from(pluginCss.values()).join("\n");
}

export function getPluginCssIds(): string[] {
  return Array.from(pluginCss.keys());
}

export function getPluginCssById(id: string): string | undefined {
  return pluginCss.get(id);
}

export function getPluginScriptFolders(): string[] {
  return Array.from(scriptFolderSource.keys());
}

export function getScriptFolderSource(
  folder: string,
): "plugin" | "builtin" | null {
  return scriptFolderSource.get(folder) ?? null;
}

import { join } from "path";
import type { PluginContext, SettingField } from "../types";
import {
  getSettings,
  mergeDefaults,
  type SettingValue,
} from "./plugin-settings";

type PluginLike = {
  init?: (ctx: PluginContext) => void | Promise<void>;
  configure?: (settings: Record<string, SettingValue>) => void;
  settingsSchema?: SettingField[];
};

export async function loadPluginAssets(
  entryPath: string,
  folderName: string,
  settingsId: string,
  source: "plugin" | "builtin",
): Promise<string> {
  const { readFile, stat } = await import("fs/promises");
  const template = await readFile(
    join(entryPath, "template.html"),
    "utf-8",
  ).catch(() => "");
  const css = await readFile(join(entryPath, "style.css"), "utf-8").catch(
    () => "",
  );
  if (css) addPluginCss(settingsId, css);
  const hasScript = await stat(join(entryPath, "script.js")).catch(() => null);
  if (hasScript?.isFile()) registerPluginScript(folderName, source, settingsId);
  return template;
}

export async function initPlugin(
  plugin: PluginLike,
  entryPath: string,
  settingsId: string,
  template: string,
): Promise<void> {
  const { readFile } = await import("fs/promises");
  if (plugin.init) {
    const ctx: PluginContext = {
      dir: entryPath,
      template,
      readFile: (filename: string) =>
        readFile(join(entryPath, filename), "utf-8"),
    };
    await Promise.resolve(plugin.init(ctx));
  }
  if (plugin.configure && plugin.settingsSchema?.length) {
    const stored = await getSettings(settingsId);
    plugin.configure(mergeDefaults(stored, plugin.settingsSchema));
  }
}
