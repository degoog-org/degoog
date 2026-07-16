import { mkdir, writeFile } from "fs/promises";
import { basename, resolve, sep } from "path";
import { getExtensionDir } from "./plugin-assets";
import { logger } from "./logger";

const UPLOADS_SUBDIR = "uploads";

const SERVABLE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".json",
  ".css",
  ".ttf",
  ".woff",
  ".woff2",
]);

const _extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
};

const _safeName = (filename: string): string => {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const ext = _extensionOf(base);
  const stem =
    base
      .slice(0, base.length - ext.length)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "file";
  const stamp = Date.now().toString(36);
  return `${stem}-${stamp}${ext}`;
};

export interface SavedUpload {
  path: string;
  name: string;
}

/**
 * Persists an uploaded file inside the extension's own `uploads/` folder and
 * returns the publicly served path. The extension directory is resolved from
 * the registry (the same absolute path exposed to plugins as `ctx.dir`), never
 * derived from client input or a hardcoded folder scheme.
 */
export const savePluginUpload = async (
  settingsId: string,
  filename: string,
  data: Uint8Array,
): Promise<SavedUpload | null> => {
  const dir = getExtensionDir(settingsId);
  if (!dir) {
    logger.warn("uploads", `no registered directory for extension ${settingsId}`);
    return null;
  }
  const ext = _extensionOf(filename);
  if (!SERVABLE_EXTENSIONS.has(ext)) {
    logger.warn("uploads", `rejected upload extension "${ext}" for ${settingsId}`);
    return null;
  }
  const name = _safeName(filename);
  const uploadsDir = resolve(dir, UPLOADS_SUBDIR);
  const target = resolve(uploadsDir, name);
  if (target !== uploadsDir && !target.startsWith(uploadsDir + sep)) {
    logger.warn("uploads", `path containment failed for ${settingsId}/${name}`);
    return null;
  }
  try {
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(target, data);
  } catch (err) {
    logger.warn("uploads", `failed to write upload for ${settingsId}`, err);
    return null;
  }
  const folder = basename(dir);
  return { path: `/plugins/${folder}/${UPLOADS_SUBDIR}/${name}`, name };
};
