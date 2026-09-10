import { access } from "fs/promises";
import { join } from "path";
import { enginesDir, pluginsDir, themesDir, transportsDir } from "./paths";

type ExtensionDocsPath = { readmePath: string; exists: boolean };

const _PLUGIN_SUFFIXES = ["-command", "-slot", "-middleware", "-tab"];

const _destDirFromId = (id: string): string | null => {
  if (_PLUGIN_SUFFIXES.some((s) => id.endsWith(s))) return pluginsDir();
  if (id.endsWith("-theme")) return themesDir();
  if (id.endsWith("-transport")) return transportsDir();
  if (id.endsWith("-engine")) return enginesDir();
  return null;
};

const _SAFE_FOLDER = /^[A-Za-z0-9._-]+$/;

const _folderById = new Map<string, string>();

const _docsDirById = new Map<string, string>();

export const registerExtensionFolder = (id: string, folder: string): void => {
  _folderById.set(id, folder);
};

export const registerDocsDir = (id: string, dir: string): void => {
  _docsDirById.set(id, dir);
};

export const getExtensionReadmePath = (id: string, folder?: string): string | null => {
  const known = _docsDirById.get(id);
  if (known) return join(known, "README.md");
  const base = _destDirFromId(id);
  if (!base) return null;
  const fallbackFolder = id.replace(
    /-(command|slot|middleware|tab|theme|transport|engine)$/,
    "",
  );
  const resolved = folder ?? _folderById.get(id) ?? fallbackFolder;
  if (!resolved.trim() || !_SAFE_FOLDER.test(resolved)) return null;
  return join(base, resolved, "README.md");
};

export const extensionReadmeExists = async (
  id: string,
  folder?: string,
): Promise<ExtensionDocsPath> => {
  const readmePath = getExtensionReadmePath(id, folder);
  if (!readmePath) return { readmePath: "", exists: false };
  try {
    await access(readmePath);
    return { readmePath, exists: true };
  } catch {
    return { readmePath, exists: false };
  }
};

