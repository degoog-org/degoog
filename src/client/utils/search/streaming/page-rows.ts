import type { ScoredResult } from "../../../../shared/search-types";

const _dedupeKey = (url: string): string => {
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase().replace(/^www\./, "");
    return `${host}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return url;
  }
};

export const shownKeys = (results: ScoredResult[]): Set<string> =>
  new Set(results.map((r) => _dedupeKey(r.url)));

export const unseenRows = (
  results: ScoredResult[],
  shown: ReadonlySet<string>,
): ScoredResult[] => results.filter((r) => !shown.has(_dedupeKey(r.url)));
