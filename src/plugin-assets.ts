const pluginCss = new Map<string, string>();
const scriptFolderSource = new Map<string, "plugin" | "builtin">();

export function addPluginCss(id: string, css: string): void {
  pluginCss.set(id, css);
}

export function registerPluginScript(
  folderName: string,
  source: "plugin" | "builtin" = "plugin",
): void {
  scriptFolderSource.set(folderName, source);
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
