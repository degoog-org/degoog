const pluginCss = new Map<string, string>();
const scriptFolderSource = new Map<string, "plugin" | "builtin">();
const folderSettingsIds = new Map<string, Set<string>>();

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

export function getPluginScriptFolders(): string[] {
  return Array.from(scriptFolderSource.keys());
}

export function getScriptFolderSource(folder: string): "plugin" | "builtin" | null {
  return scriptFolderSource.get(folder) ?? null;
}
