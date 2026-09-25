import { ExtensionStoreType } from "../../types/extension";
import type { RepoPackageItem, RepoPackageJson } from "../../types/store";
import { STORE_TYPE_SPECS } from "./store-types";
import { ReloadMode, reloadSync } from "./reload-sync";
import { makeExtID } from "../../utils/extension-support/extension-id";

export function getDestDir(type: ExtensionStoreType): string {
  return STORE_TYPE_SPECS[type].destDir();
}

export function canonicalInstalledFolder(
  type: ExtensionStoreType,
  folderName: string,
): string {
  if (type === ExtensionStoreType.Theme) return makeExtID(folderName, "theme");
  if (type === ExtensionStoreType.Autocomplete)
    return makeExtID(folderName, "autocomplete");
  if (type === ExtensionStoreType.Shortcut)
    return makeExtID(folderName, "shortcut");
  return folderName;
}

export function settingsIdsForInstalled(
  type: ExtensionStoreType,
  installedAs: string,
): string[] {
  return STORE_TYPE_SPECS[type].settingsIds(installedAs);
}

export function getEntriesForType(
  pkg: RepoPackageJson,
  type: ExtensionStoreType,
): RepoPackageItem[] | undefined {
  return pkg[STORE_TYPE_SPECS[type].manifestKey];
}

export async function reloadAfterAction(
  type: ExtensionStoreType,
  bust = true,
): Promise<void> {
  await reloadSync(type, bust ? ReloadMode.Bump : ReloadMode.Refresh);
}

export function parseDependencyUrl(depUrl: string): {
  repoUrl: string;
  type: ExtensionStoreType;
  itemPath: string;
} | null {
  const cleaned = depUrl.replace(/\.git(\/|$)/, "/").replace(/\/$/, "");
  const typePatterns: Array<{ type: ExtensionStoreType; pattern: RegExp }> = [
    { type: ExtensionStoreType.Plugin, pattern: /^(.+?)\/(plugins\/[^/]+)$/ },
    { type: ExtensionStoreType.Theme, pattern: /^(.+?)\/(themes\/[^/]+)$/ },
    { type: ExtensionStoreType.Engine, pattern: /^(.+?)\/(engines\/[^/]+)$/ },
    {
      type: ExtensionStoreType.Transport,
      pattern: /^(.+?)\/(transports\/[^/]+)$/,
    },
    {
      type: ExtensionStoreType.Autocomplete,
      pattern: /^(.+?)\/(autocomplete\/[^/]+)$/,
    },
    {
      type: ExtensionStoreType.Shortcut,
      pattern: /^(.+?)\/(shortcuts\/[^/]+)$/,
    },
  ];
  for (const { type, pattern } of typePatterns) {
    const match = cleaned.match(pattern);
    if (match) return { repoUrl: match[1], type, itemPath: match[2] };
  }
  return null;
}
