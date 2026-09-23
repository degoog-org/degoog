import type { SearchEngine } from "../../types/extension";
import { getTypeOverride } from "../../utils/settings/plugin-settings";
import { logger } from "../../utils/logger";
import type { EngineFilters } from "../../../shared/engine-filters";
import type { PluginEntry } from "./entries";

const TYPE_CACHE_TTL_MS = 60_000;
const _typeCache = new Map<string, { types: string[]; at: number }>();

export const clearTypeCache = (): void => {
  _typeCache.clear();
};

export type TypeFn = () => string[] | Promise<string[]>;

export const coerceTypeList = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.filter(
      (t): t is string => typeof t === "string" && t.trim() !== "",
    );
  }
  if (typeof raw === "string" && raw.trim()) return [raw];
  return [];
};

export const coerceFilters = (raw: unknown): EngineFilters | undefined => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return undefined;
  const out: EngineFilters = {};
  for (const [group, values] of Object.entries(raw as Record<string, unknown>)) {
    const list = coerceTypeList(values);
    if (list.length > 0) out[group] = list;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

export const resolveTypes = (
  baseTypes: string[],
  override: string | null,
): string[] => {
  if (override)
    return override
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  return baseTypes;
};

export const primaryType = (types: string[]): string =>
  types.length > 0 ? types[0] : "web";

export const resolveTabSearchType = (
  types: string[],
  preferred?: string,
): string => {
  const normalized = preferred?.trim().toLowerCase();
  if (normalized && types.some((t) => t.toLowerCase() === normalized)) {
    return types.find((t) => t.toLowerCase() === normalized) ?? normalized;
  }
  return primaryType(types);
};

const _resolving = new Set<string>();

const computeEngineTypes = async (entry: PluginEntry): Promise<string[]> => {
  const override = await getTypeOverride(entry.id);
  const dyn = (entry.instance as SearchEngine & { __typeFn?: TypeFn }).__typeFn;

  if (dyn && !_resolving.has(entry.id)) {
    _resolving.add(entry.id);
    try {
      const result = await dyn();
      return resolveTypes(coerceTypeList(result), override);
    } catch (err) {
      logger.warn("engines", `dynamic type() failed for ${entry.id}`, err);
    } finally {
      _resolving.delete(entry.id);
    }
  }

  const base = entry.searchTypes.length > 0 ? entry.searchTypes : ["web"];
  return resolveTypes(base, override);
};

export const resolveEngineTypes = async (
  entry: PluginEntry,
): Promise<string[]> => {
  const cached = _typeCache.get(entry.id);
  if (cached && Date.now() - cached.at < TYPE_CACHE_TTL_MS) return cached.types;
  const types = await computeEngineTypes(entry);
  _typeCache.set(entry.id, { types, at: Date.now() });
  return types;
};
