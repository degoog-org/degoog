import type { SearchResponse, RichSuggestion } from "../types";
import { logger } from "./logger";
import {
  INVALIDATE_SCOPE,
  isValkeyEnabled,
  kvDel,
  kvDelPrefix,
  kvGet,
  kvSet,
  onInvalidate,
  publishInvalidate,
} from "./cache-valkey";

const _readPositiveIntEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const TTL_MS = _readPositiveIntEnv(
  "DEGOOG_CACHE_TTL_MS",
  12 * 60 * 60 * 1000,
);
export const SHORT_TTL_MS = _readPositiveIntEnv(
  "DEGOOG_CACHE_SHORT_TTL_MS",
  2 * 60 * 1000,
);

const NS = "cache";
const SEARCH_NAMESPACE = "search";
const AUTOCOMPLETE_NAMESPACE = "autocomplete";

const DEFAULT_MAX_ENTRIES = 1000;
const _envMaxEntries = Number.parseInt(
  process.env.DEGOOG_CACHE_MAX_ENTRIES ?? "",
  10,
);
const MAX_ENTRIES =
  Number.isFinite(_envMaxEntries) && _envMaxEntries > 0
    ? _envMaxEntries
    : DEFAULT_MAX_ENTRIES;

export const CACHE_SCOPE = {
  SEARCH: "search",
  AUTOCOMPLETE: "autocomplete",
  EXTENSIONS: "extensions",
  ALL: "all",
} as const;

export type CacheScope = (typeof CACHE_SCOPE)[keyof typeof CACHE_SCOPE];

export const isCacheScope = (v: unknown): v is CacheScope =>
  typeof v === "string" && (Object.values(CACHE_SCOPE) as string[]).includes(v);

export type TtlCache<T> = {
  get(key: string): T | null;
  set(key: string, value: T, ttlMs?: number): void;
  clear(): void;
};

export interface AsyncTtlCache<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * @deprecated Use `useCache` instead. Sync caches are per-process only and
 * cannot be shared across replicas via the optional Valkey sidecar. `useCache`
 * is async, namespaced, and transparently Valkey-backed when configured.
 */
export function createCache<T>(
  defaultTtlMs: number,
  maxEntries: number = MAX_ENTRIES,
): TtlCache<T> {
  const store = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key: string): T | null {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key: string, value: T, ttlMs: number = defaultTtlMs): void {
      if (store.has(key)) {
        store.delete(key);
      } else if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    clear(): void {
      store.clear();
    },
  };
}

export type CreateCache = typeof createCache;

interface RegisteredCache {
  cache: AsyncTtlCache<unknown>;
  clearLocal: () => void;
}

const _registry = new Map<string, RegisteredCache>();

export const useCache = <T>(
  namespace: string,
  defaultTtlMs: number,
): AsyncTtlCache<T> => {
  if (typeof namespace !== "string" || namespace.trim() === "") {
    throw new TypeError(
      `useCache(namespace, defaultTtlMs): "namespace" must be a non-empty string. ` +
        `Received: ${typeof namespace} (${String(namespace)}). ` +
        `Example: useCache<MyType>("ext:my-plugin:articles", 60_000)`,
    );
  }
  if (
    typeof defaultTtlMs !== "number" ||
    !Number.isFinite(defaultTtlMs) ||
    defaultTtlMs <= 0
  ) {
    throw new TypeError(
      `useCache(namespace, defaultTtlMs): "defaultTtlMs" must be a positive finite number (milliseconds). ` +
        `Received: ${typeof defaultTtlMs} (${String(defaultTtlMs)}).`,
    );
  }

  const existing = _registry.get(namespace);
  if (existing) return existing.cache as AsyncTtlCache<T>;

  const mem = createCache<T>(defaultTtlMs);
  const cache: AsyncTtlCache<T> = {
    async get(key: string): Promise<T | null> {
      if (isValkeyEnabled()) {
        const hit = await kvGet<T>(namespace, key);
        if (hit !== null) return hit;
      }
      return mem.get(key);
    },
    async set(
      key: string,
      value: T,
      ttlMs: number = defaultTtlMs,
    ): Promise<void> {
      mem.set(key, value, ttlMs);
      if (isValkeyEnabled()) await kvSet<T>(namespace, key, value, ttlMs);
    },
    async delete(key: string): Promise<void> {
      if (isValkeyEnabled()) await kvDel(namespace, key);
    },
    async clear(): Promise<void> {
      mem.clear();
      if (isValkeyEnabled()) await kvDelPrefix(namespace);
      await publishInvalidate(INVALIDATE_SCOPE.CACHE_CLEAR, namespace);
    },
  };

  _registry.set(namespace, {
    cache: cache as AsyncTtlCache<unknown>,
    clearLocal: () => mem.clear(),
  });

  return cache;
};

export type UseCache = typeof useCache;

onInvalidate((payload) => {
  if (payload.scope !== INVALIDATE_SCOPE.CACHE_CLEAR) return;
  if (!payload.key) return;
  const entry = _registry.get(payload.key);
  if (!entry) return;
  entry.clearLocal();
  logger.debug(
    NS,
    `cleared local memory for namespace=${payload.key} (peer invalidation)`,
  );
});

const _searchCache = useCache<SearchResponse>(SEARCH_NAMESPACE, TTL_MS);

export type AutocompleteCacheItem = {
  text: string;
  source: string;
  rich?: RichSuggestion;
};

export const autocompleteCache = useCache<AutocompleteCacheItem[]>(
  AUTOCOMPLETE_NAMESPACE,
  TTL_MS,
);

export const get = (key: string): Promise<SearchResponse | null> =>
  _searchCache.get(key);

export const set = (
  key: string,
  value: SearchResponse,
  ttlMs: number = TTL_MS,
): Promise<void> => _searchCache.set(key, value, ttlMs);

const _namespacesForScope = (scope: CacheScope): string[] => {
  const all = Array.from(_registry.keys());
  switch (scope) {
    case CACHE_SCOPE.ALL:
      return all;
    case CACHE_SCOPE.SEARCH:
      return all.filter((n) => n === SEARCH_NAMESPACE);
    case CACHE_SCOPE.AUTOCOMPLETE:
      return all.filter((n) => n === AUTOCOMPLETE_NAMESPACE);
    case CACHE_SCOPE.EXTENSIONS:
      return all.filter(
        (n) => n !== SEARCH_NAMESPACE && n !== AUTOCOMPLETE_NAMESPACE,
      );
    default:
      return [];
  }
};

export const clearByScope = async (scope: CacheScope): Promise<string[]> => {
  const namespaces = _namespacesForScope(scope);
  await Promise.all(
    namespaces.map(
      (ns) => _registry.get(ns)?.cache.clear() ?? Promise.resolve(),
    ),
  );
  logger.info(
    NS,
    `cleared scope=${scope} namespaces=[${namespaces.join(", ")}]`,
  );
  return namespaces;
};

export const clear = (): Promise<string[]> => clearByScope(CACHE_SCOPE.ALL);

export const listCacheNamespaces = (): string[] => Array.from(_registry.keys());

export function hasFailedEngines(response: SearchResponse): boolean {
  return response.engineTimings.some((et) => et.resultCount === 0);
}
