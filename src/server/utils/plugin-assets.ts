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

export function lockinNameSpace(folderName: string, namespace: string): void {
  folderNamespaces.set(folderName, namespace);
}

export function getPluginNamespace(folderName: string): string | null {
  return folderNamespaces.get(folderName) ?? null;
}

export function lockinSettingsId(folderName: string, settingsId: string): void {
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
import { createCache, useCache } from "./cache";
import { outgoingFetch } from "./outgoing";
import { buildSignedProxyUrl } from "./proxy-sign";
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

const _initedPlugins = new WeakSet<object>();

export const PLUGIN_API_PREFIX = "/api/plugin";

export const buildApiBase = (pluginId: string): string =>
  `${PLUGIN_API_PREFIX}/${pluginId}`;

export const buildRouteUrl = (pluginId: string, path = ""): string => {
  const apiBase = buildApiBase(pluginId);
  const suffix = String(path || "").replace(/^\/+/, "");
  return suffix ? `${apiBase}/${suffix}` : apiBase;
};

export const forgetPluginInit = (plugin: object): void => {
  _initedPlugins.delete(plugin);
};

export async function loadPluginAssets(
  entryPath: string,
  folderName: string,
  settingsId: string,
  source: "plugin" | "builtin" = "plugin",
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
  options: { pluginId: string },
): Promise<void> {
  const { readFile } = await import("fs/promises");
  const { pluginId } = options;
  const alreadyInited = _initedPlugins.has(plugin as object);
  if (plugin.init && !alreadyInited) {
    const ctx: PluginContext = {
      id: pluginId,
      pluginId,
      apiBase: buildApiBase(pluginId),
      routeUrl: (path = "") => buildRouteUrl(pluginId, path),
      dir: entryPath,
      template,
      readFile: (filename: string) =>
        readFile(join(entryPath, filename), "utf-8"),
      signProxyUrl: buildSignedProxyUrl,
      fetch: outgoingFetch as PluginContext["fetch"],
      createCache,
      useCache,
    };
    await Promise.resolve(plugin.init(ctx));
    _initedPlugins.add(plugin as object);
  }
  if (plugin.configure && plugin.settingsSchema?.length) {
    const stored = await getSettings(settingsId);
    plugin.configure(mergeDefaults(stored, plugin.settingsSchema));
  }
}
