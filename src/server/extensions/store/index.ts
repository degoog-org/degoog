import { resolve, relative } from "path";
import { getStoreDir, normalizeRepoUrl } from "./persistence";
import { slugFromUrl } from "./repo-ops";

export * from "./persistence";
export * from "./repo-ops";
export * from "./item-ops";

const REPO_ASSET_EXT = /\.(png|jpeg|jpg|gif|webp|svg)$/i;
const SAFE_REPO_SLUG = /^[A-Za-z0-9_-]+$/;

const _withinStore = (storeDir: string, full: string): boolean => {
  const rel = relative(storeDir, full);
  return !rel.startsWith("..") && !rel.includes("..");
};

export function getStoreDirPath(): string {
  return getStoreDir();
}

export function getRepoSlugFromUrl(url: string): string {
  return slugFromUrl(url);
}

export function resolveScreenshotPath(
  repoSlug: string,
  itemPath: string,
  filename: string,
): string | null {
  if (!SAFE_REPO_SLUG.test(repoSlug)) return null;
  const storeDir = getStoreDir();
  const repoBase = resolve(storeDir, repoSlug);
  const normalized = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  if (normalized !== filename) return null;
  const full = resolve(repoBase, itemPath, "screenshots", filename);
  const rel = relative(repoBase, full);
  if (rel.startsWith("..") || rel.includes("..")) return null;
  if (!_withinStore(storeDir, full)) return null;
  return full;
}

export function resolveRepoAssetPath(
  repoSlug: string,
  relativePath: string,
): string | null {
  if (!SAFE_REPO_SLUG.test(repoSlug)) return null;
  const storeDir = getStoreDir();
  const repoBase = resolve(storeDir, repoSlug);
  const trimmed = relativePath.replace(/^\/+/, "").trim();
  if (!trimmed || trimmed.includes("..")) return null;
  if (!REPO_ASSET_EXT.test(trimmed)) return null;
  const full = resolve(repoBase, trimmed);
  const rel = relative(repoBase, full);
  if (rel.startsWith("..") || rel.includes("..")) return null;
  if (!_withinStore(storeDir, full)) return null;
  return full;
}

export { normalizeRepoUrl };
