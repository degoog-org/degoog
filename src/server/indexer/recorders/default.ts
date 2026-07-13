import type { SearchResult } from "../../types";
import { normalizeUrl, urlIsGif } from "../../search/url-normalize";

export interface IndexRow {
  query_norm: string;
  engine_type: string;
  url: string;
  url_norm: string;
  source_engine: string;
  title: string;
  snippet: string;
  thumbnail: string | null;
  image_url: string | null;
  is_gif: number | null;
  duration: string | null;
  extras_json: string | null;
  position: number;
  sources_json: string | null;
  filters_json: string | null;
  meta_json: string | null;
}

export interface Recorder {
  toRows: (
    queryNorm: string,
    engineType: string,
    results: SearchResult[],
    filtersJson: string | null,
    positions?: number[],
  ) => IndexRow[];
}

const sourcesOf = (r: SearchResult): string => {
  const withSources = r as SearchResult & { sources?: unknown };
  const list = Array.isArray(withSources.sources)
    ? withSources.sources.filter((s): s is string => typeof s === "string")
    : [];
  const unique = [...new Set(list.length > 0 ? list : [r.source])].filter(Boolean);
  return JSON.stringify(unique);
};

const KNOWN_FIELDS = new Set([
  "title",
  "url",
  "snippet",
  "source",
  "thumbnail",
  "imageUrl",
  "isGif",
  "duration",
]);

const extractExtras = (r: SearchResult): string | null => {
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (!KNOWN_FIELDS.has(k) && v !== undefined && v !== null) {
      extras[k] = v;
    }
  }
  return Object.keys(extras).length > 0 ? JSON.stringify(extras) : null;
};

export const DEFAULT_RECORDER: Recorder = {
  toRows: (queryNorm, engineType, results, filtersJson, positions) => {
    const rows: IndexRow[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.url || !r.title) continue;
      rows.push({
        query_norm: queryNorm,
        engine_type: engineType,
        url: r.url,
        url_norm: normalizeUrl(r.url),
        source_engine: r.source,
        title: r.title,
        snippet: r.snippet ?? "",
        thumbnail: r.thumbnail ?? null,
        image_url: r.imageUrl ?? null,
        is_gif:
          r.isGif === true || urlIsGif(r.imageUrl) ? 1 : r.isGif === false ? 0 : null,
        duration: r.duration ?? null,
        extras_json: extractExtras(r),
        position: positions ? positions[i] : i,
        sources_json: sourcesOf(r),
        filters_json: filtersJson,
        meta_json: null,
      });
    }
    return rows;
  },
};
