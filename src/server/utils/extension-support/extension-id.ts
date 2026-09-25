import { createHash } from "crypto";
import { logger } from "../logger";

export type ExtensionKind =
  | "slot"
  | "middleware"
  | "tab"
  | "transport"
  | "command"
  | "engine"
  | "theme"
  | "autocomplete"
  | "shortcut"
  | "uovadipasqua";

const _shortHash = (input: string): string =>
  createHash("sha256").update(input).digest("hex").slice(0, 8);

export const makeExtID = (
  folderName: string,
  kind: ExtensionKind,
): string => {
  const lower = folderName.toLowerCase();
  const suffix = `-${kind}`;
  return lower.endsWith(suffix) ? lower : `${lower}${suffix}`;
};

export const folderFromExtID = (id: string, kind: ExtensionKind): string => {
  const suffix = `-${kind}`;
  return id.endsWith(suffix) ? id.slice(0, -suffix.length) : id;
};

export const dedupeExtID = (
  desired: string,
  existing: Set<string>,
  entryPath: string,
): string => {
  if (!existing.has(desired)) return desired;
  const withHash = `${desired}-${_shortHash(entryPath)}`;
  if (!existing.has(withHash)) return withHash;
  return `${withHash}-${_shortHash(withHash)}`;
};

export const slugifyIdPart = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "unknown";

const _repoAuthorAndName = (
  repoUrl: string,
): { author: string; name: string } => {
  try {
    const u = new URL(repoUrl.replace(/\.git$/, ""));
    const parts = u.pathname.split("/").filter(Boolean);
    return {
      author: slugifyIdPart(parts[0] ?? "unknown"),
      name: slugifyIdPart((parts[1] ?? "repo").replace(/\.git$/, "")),
    };
  } catch (err) {
    logger.debug("extension-id", `invalid repo URL "${repoUrl}"`, err);
    return { author: "unknown", name: "repo" };
  }
};

export const folderNameForItem = (
  repoUrl: string,
  itemPath: string,
): string => {
  const { author, name } = _repoAuthorAndName(repoUrl);
  const itemFolder = itemPath.split("/").pop() ?? itemPath;
  return `${author}-${name}-${slugifyIdPart(itemFolder)}`;
};

export const rewriteThemePaths = (content: string, id: string): string =>
  content
    .replace(/__THEME_PATH__/g, `/themes/${id}`)
    .replace(/(["'(`\s])\/themes\/[\w-]+\//g, `$1/themes/${id}/`)
    .replace(
      /url\(\s*(['"]?)(?!https?:|\/|data:)([^'"\s)]+)\1\s*\)/g,
      `url($1/themes/${id}/$2$1)`,
    );

export const rewritePluginPaths = (code: string, id: string): string =>
  code
    .replace(/\/api\/plugin\/[\w-]+\//g, `/api/plugin/${id}/`)
    .replace(/\/plugins\/[\w-]+\//g, `/plugins/${id}/`)
    .replace(
      /\(document\.currentScript\s+instanceof\s+HTMLScriptElement\b[^?]*\)\?\.\[1\]\s*\?\?\s*["'][^"']*["']/gs,
      "__PLUGIN_ID__",
    );
