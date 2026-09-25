import { readFile } from "fs/promises";
import { join } from "path";
import type { ShortcutBinding, ShortcutKind } from "../../../shared/shortcuts";

const ENGINE_TYPE_STRING_RE = /export\s+const\s+type\s*=\s*["']([^"']+)["']/;
const ENGINE_TYPE_ARRAY_RE = /export\s+const\s+type\s*=\s*\[([^\]]+)\]/;
const engineTypesCache = new Map<string, string[] | null>();

const parseEngineTypesFromSource = (src: string): string[] | null => {
  const strMatch = ENGINE_TYPE_STRING_RE.exec(src);
  if (strMatch) return [strMatch[1].trim()];
  const arrMatch = ENGINE_TYPE_ARRAY_RE.exec(src);
  if (!arrMatch) return null;
  const types = arrMatch[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  return types.length > 0 ? types : null;
};

const NEEDS_APP_RESTART_RE = /\bneedsAppRestart\s*[:=]\s*true\b/;
const needsAppRestartCache = new Map<string, boolean>();

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

export const readNeedsAppRestart = async (dir: string): Promise<boolean> => {
  if (needsAppRestartCache.has(dir)) return needsAppRestartCache.get(dir)!;
  let result = false;
  for (const file of ["index.js", "index.ts", "index.mjs", "index.cjs"]) {
    try {
      const src = await readFile(join(dir, file), "utf-8");
      result = NEEDS_APP_RESTART_RE.test(stripComments(src));
      if (result) break;
    } catch {
      continue;
    }
  }
  needsAppRestartCache.set(dir, result);
  return result;
};

const SHORTCUT_KIND_RE = /\bkind\s*:\s*["'](single|numeric)["']/;
const SHORTCUT_BINDING_RE = /defaultBinding\s*:\s*\{([^}]*)\}/;
const SHORTCUT_KEY_RE = /["']?\bkey\b["']?\s*:\s*["']([^"']+)["']/;
const shortcutMetaCache = new Map<string, ShortcutCatalogMeta | null>();

type ShortcutCatalogMeta = {
  binding: ShortcutBinding;
  kind: ShortcutKind;
};

export const parseShortcutMetaFromSource = (
  src: string,
): ShortcutCatalogMeta | null => {
  const blockMatch = SHORTCUT_BINDING_RE.exec(src);
  if (!blockMatch) return null;
  const block = blockMatch[1];
  const binding: ShortcutBinding = {};
  const keyMatch = SHORTCUT_KEY_RE.exec(block);
  if (keyMatch) binding.key = keyMatch[1];
  for (const mod of ["ctrl", "meta", "alt", "shift"] as const) {
    if (new RegExp(`["']?\\b${mod}\\b["']?\\s*:\\s*true`).test(block)) binding[mod] = true;
  }
  const kind: ShortcutKind =
    SHORTCUT_KIND_RE.exec(src)?.[1] === "numeric" ? "numeric" : "single";
  if (kind === "single" && !binding.key) return null;
  const hasModifier =
    binding.ctrl || binding.meta || binding.alt || binding.shift;
  if (kind === "numeric" && !hasModifier) return null;
  return { binding, kind };
};

export const readShortcutMeta = async (
  dir: string,
): Promise<ShortcutCatalogMeta | null> => {
  if (shortcutMetaCache.has(dir)) return shortcutMetaCache.get(dir) ?? null;
  let result: ShortcutCatalogMeta | null = null;
  for (const file of ["index.js", "index.ts", "index.mjs", "index.cjs"]) {
    try {
      const src = await readFile(join(dir, file), "utf-8");
      result = parseShortcutMetaFromSource(src);
      if (result) break;
    } catch {
      continue;
    }
  }
  shortcutMetaCache.set(dir, result);
  return result;
};

export const readEngineTypes = async (dir: string): Promise<string[] | null> => {
  if (engineTypesCache.has(dir)) return engineTypesCache.get(dir) ?? null;
  let result: string[] | null = null;
  for (const file of ["index.js", "index.ts"]) {
    try {
      const src = await readFile(join(dir, file), "utf-8");
      result = parseEngineTypesFromSource(src);
      if (result) break;
    } catch {
      // I'm leaving an empty catch here to avoid log spam, this is an expected error as we are optimistically checking for an index file of some sort.
      // It was showing an annoying `DEBUG [store:item] engine type file index.ts read failed in /app/data/store/degoog-org-official-extensions/engines/google`
      // over and over and there's absolutely no need for it.
      continue;
    }
  }
  engineTypesCache.set(dir, result);
  return result;
};

export function clearItemCachesForRepo(repoPath: string): void {
  const prefix = repoPath.endsWith("/") ? repoPath : `${repoPath}/`;
  for (const cache of [needsAppRestartCache, engineTypesCache, shortcutMetaCache]) {
    for (const key of cache.keys()) {
      if (key === repoPath || key.startsWith(prefix)) cache.delete(key);
    }
  }
}

export const clearNeedsAppRestart = (dir: string): void => {
  needsAppRestartCache.delete(dir);
};
