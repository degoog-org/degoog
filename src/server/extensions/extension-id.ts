import { createHash } from "crypto";

export type ExtensionKind =
  | "slot"
  | "middleware"
  | "tab"
  | "transport"
  | "command"
  | "engine"
  | "theme"
  | "uovadipasqua";

export type ExtensionOrigin = "plugin" | "builtin";

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}

export function makeExtID(
  folderName: string,
  origin: ExtensionOrigin,
  kind: ExtensionKind,
): string {
  const base = origin === "builtin" ? `builtin-${folderName}` : folderName;
  const suffix = `-${kind}`;
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

export function dedupeExtID(
  desired: string,
  existing: Set<string>,
  entryPath: string,
): string {
  if (!existing.has(desired)) return desired;
  const withHash = `${desired}-${shortHash(entryPath)}`;
  if (!existing.has(withHash)) return withHash;
  return `${withHash}-${shortHash(withHash)}`;
}

function authorFromFolder(
  folderName: string,
  legacyDevId: string,
): string | null {
  const devPrefix = legacyDevId.split("-")[0] ?? "";
  if (!devPrefix) return null;
  const suffix = `-${devPrefix}`;
  if (!folderName.endsWith(suffix)) return null;
  const author = folderName.slice(0, -suffix.length);
  return author.trim() ? author : null;
}

/**
 * @fccview here, I apologise if you came across this disgusting bit of software engineering.
 * I don't want users to have their settings lost and decide to re-think how third party extensions
 * get installed/stored, the old system caused conflicts when extensions had the same IDs, this is what I get
 * for allowing developers to use their own IDs.
 */
export function stupidSettingIDtoAvoidConflicts(args: {
  kind: "slot" | "middleware" | "tab" | "transport";
  canonicalId: string;
  folderName: string;
  legacyDevId?: string;
  explicitSettingsId?: string;
}): { settingsId: string; fallbackSettingsIds: string[] } {
  const { kind, canonicalId, folderName, legacyDevId, explicitSettingsId } =
    args;
  const prefix = kind;

  const settingsId = explicitSettingsId ?? `${prefix}-${canonicalId}`;
  const derivedAuthor =
    folderName && legacyDevId
      ? authorFromFolder(folderName, legacyDevId)
      : null;

  const fallbackSettingsIds = [
    // For my own mental sanity and to remember why I made this idiocy,
    // this is for suffix-form for legacy settings keys e.g. `tmdb-slot` or `sakura-theme`
    legacyDevId ? `${legacyDevId}-${prefix}` : "",
    folderName ? `${folderName}-${prefix}` : "",
    derivedAuthor && legacyDevId
      ? `${derivedAuthor}-${legacyDevId}-${prefix}`
      : "",
  ].filter(Boolean);

  return { settingsId, fallbackSettingsIds };
}
