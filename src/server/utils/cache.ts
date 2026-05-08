import type { SearchResponse } from "../types";

export const TTL_MS = 12 * 60 * 60 * 1000;
export const SHORT_TTL_MS = 2 * 60 * 1000;
export const NEWS_TTL_MS = 30 * 60 * 1000;

export type TtlCache<T> = {
  get(key: string): T | null;
  set(key: string, value: T, ttlMs?: number): void;
  clear(): void;
};

export function createCache<T>(defaultTtlMs: number): TtlCache<T> {
  const store = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key: string): T | null {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key: string, value: T, ttlMs: number = defaultTtlMs): void {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    clear(): void {
      store.clear();
    },
  };
}

export type CreateCache = typeof createCache;

const _searchCache = createCache<SearchResponse>(TTL_MS);
export const autocompleteCache = createCache<{
  text: string;
  source: string;
  rich?: import("../types").RichSuggestion;
}[]>(TTL_MS);

export const get = (key: string): SearchResponse | null => _searchCache.get(key);
export const set = (key: string, value: SearchResponse, ttlMs: number = TTL_MS): void =>
  _searchCache.set(key, value, ttlMs);
export const clear = (): void => {
  _searchCache.clear();
  autocompleteCache.clear();
};

export function hasFailedEngines(response: SearchResponse): boolean {
  return response.engineTimings.some((et) => et.resultCount === 0);
}
