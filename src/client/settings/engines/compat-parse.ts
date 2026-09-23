import type { CompatCatalogItem, CompatRuntimeNeed } from "../../../shared/compat-layers";

const _isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const _strings = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === "string")
    : [];

const _asRuntimeNeed = (raw: unknown): CompatRuntimeNeed | null => {
  if (!_isRecord(raw)) return null;
  if (typeof raw.module !== "string" || typeof raw.package !== "string") return null;
  return { module: raw.module, package: raw.package, missing: raw.missing === true };
};

const _stringList = (raw: unknown): string[] | null =>
  Array.isArray(raw) && raw.every((entry) => typeof entry === "string")
    ? [...(raw as string[])]
    : null;

const _asRuntimeNeeds = (raw: unknown): CompatRuntimeNeed[] | null => {
  if (!Array.isArray(raw)) return null;
  const needs: CompatRuntimeNeed[] = [];
  for (const entry of raw) {
    const need = _asRuntimeNeed(entry);
    if (!need) return null;
    needs.push(need);
  }
  return needs;
};

const _asCatalogItem = (raw: unknown): CompatCatalogItem | null => {
  if (!_isRecord(raw)) return null;
  if (typeof raw.code !== "string" || typeof raw.name !== "string") return null;
  if (typeof raw.installed !== "boolean") return null;
  const types = _stringList(raw.types);
  const missingDeps = _stringList(raw.missingDeps);
  const runtime = _asRuntimeNeeds(raw.runtime);
  if (!types || !missingDeps || !runtime) return null;
  const item: CompatCatalogItem = {
    code: raw.code,
    name: raw.name,
    types,
    installed: raw.installed,
    missingDeps,
    runtime,
  };
  if (typeof raw.site === "string") item.site = raw.site;
  if (Array.isArray(raw.deps)) item.deps = _strings(raw.deps);
  if (Array.isArray(raw.notes)) item.notes = _strings(raw.notes);
  return item;
};

export const parseCompatCatalogue = (raw: unknown): CompatCatalogItem[] => {
  if (!_isRecord(raw) || !Array.isArray(raw.engines)) return [];
  const items: CompatCatalogItem[] = [];
  for (const entry of raw.engines) {
    const item = _asCatalogItem(entry);
    if (item) items.push(item);
  }
  return items;
};

export const compatErrorText = (raw: unknown, fallback: string): string =>
  _isRecord(raw) && typeof raw.error === "string" && raw.error.trim()
    ? raw.error
    : fallback;

export const compatFlagOn = (raw: unknown, key: string): boolean => {
  if (!_isRecord(raw)) return false;
  const value = raw[key];
  return value === true || value === "true";
};
