import { readFile, mkdir, readdir, rename, rm, lstat } from "fs/promises";
import { join, dirname } from "path";
import { randomUUID } from "crypto";
import type { AuthorJson } from "../../types/store";
import { resolveChild, resolveRealChild } from "../../utils/paths";
import { logger } from "../../utils/logger";

export function slugifyIdPart(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "unknown"
  );
}

export function repoAuthorAndName(repoUrl: string): { author: string; name: string } {
  try {
    const u = new URL(repoUrl.replace(/\.git$/, ""));
    const parts = u.pathname.split("/").filter(Boolean);
    const authorRaw = parts[0] ?? "unknown";
    const repoRaw = (parts[1] ?? "repo").replace(/\.git$/, "");
    return { author: slugifyIdPart(authorRaw), name: slugifyIdPart(repoRaw) };
  } catch (err) {
    logger.debug("store:item", `invalid repo URL "${repoUrl}"`, err);
    return { author: "unknown", name: "repo" };
  }
}

export async function readAuthorJson(dir: string): Promise<AuthorJson | null> {
  try {
    const raw = await readFile(join(dir, "author.json"), "utf-8");
    const parsed = JSON.parse(raw) as AuthorJson;
    return parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}

export async function listScreenshots(dir: string): Promise<string[]> {
  const screenshotsDir = join(dir, "screenshots");
  try {
    const files = await readdir(screenshotsDir);
    return files.filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f)).sort();
  } catch {
    return [];
  }
}

async function copyItemDir(
  srcDir: string,
  destDir: string,
  exclude: string[],
): Promise<void> {
  if ((await lstat(srcDir)).isSymbolicLink())
    throw new Error("Symlinked store items are not supported.");
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    if (exclude.some((x) => e.name === x || e.name.startsWith(x + "/")))
      continue;
    const src = join(srcDir, e.name);
    const dest = join(destDir, e.name);
    if (e.isSymbolicLink())
      throw new Error("Symlinked store entries are not supported.");
    if (e.isDirectory()) {
      await copyItemDir(src, dest, []);
    } else if (e.isFile()) {
      await mkdir(dirname(dest), { recursive: true });
      await Bun.write(dest, await Bun.file(src).arrayBuffer());
    }
  }
}

const STORE_METADATA = ["author.json", "screenshots"];

export async function stageItemDir(
  srcDir: string,
  destBase: string,
  folderName: string,
  clearExisting?: () => Promise<void>,
): Promise<void> {
  const staged = join(destBase, `.staging-${process.pid}-${randomUUID()}`);
  try {
    await copyItemDir(srcDir, staged, STORE_METADATA);
    await clearExisting?.();
    await rename(staged, join(destBase, folderName));
  } catch (err) {
    await rm(staged, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

export async function resolveStoreItemDir(
  repoDir: string,
  normalizedPath: string,
): Promise<string> {
  const manifestPath = resolveChild(repoDir, normalizedPath);
  if (!manifestPath) throw new Error("Invalid item path.");
  try {
    if ((await lstat(manifestPath)).isSymbolicLink())
      throw new Error("Invalid item path.");
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid item path.") throw err;
    logger.debug("store:item", `item path not found ${manifestPath}`, err);
    throw new Error("Item path not found in repository.");
  }
  const srcDir = resolveRealChild(repoDir, normalizedPath);
  if (!srcDir) throw new Error("Invalid item path.");
  return srcDir;
}
