import type { EngineTiming, ScoredResult, SearchResponse } from "../../../types";
import { listEngines } from "../../engines/registry";
import { THREAT_LEVEL } from "../../../utils/sentinel";
import { logger } from "../../../utils/logger";

const NS = "searx-api";

export const SEARX_FORMAT_PARAM = "format";
export const SEARX_FORMAT_VALUE = "json";

export const SEARX_CATEGORY = {
  GENERAL: "general",
  IMAGES: "images",
  VIDEOS: "videos",
  NEWS: "news",
  MAP: "map",
  MUSIC: "music",
  FILES: "files",
  SCIENCE: "science",
  IT: "it",
} as const;

export const SEARX_TEMPLATE = {
  DEFAULT: "default.html",
  IMAGES: "images.html",
  VIDEOS: "videos.html",
} as const;

const TYPE_TO_CATEGORY: Record<string, string> = {
  web: SEARX_CATEGORY.GENERAL,
  images: SEARX_CATEGORY.IMAGES,
  videos: SEARX_CATEGORY.VIDEOS,
  news: SEARX_CATEGORY.NEWS,
};

const CATEGORY_TO_TEMPLATE: Record<string, string> = {
  [SEARX_CATEGORY.IMAGES]: SEARX_TEMPLATE.IMAGES,
  [SEARX_CATEGORY.VIDEOS]: SEARX_TEMPLATE.VIDEOS,
};

const KNOWN_CATEGORIES: ReadonlySet<string> = new Set(
  Object.values(SEARX_CATEGORY),
);

const ERROR_TEXT: Record<string, string> = {
  [THREAT_LEVEL.BLOCKED]: "Access denied",
  [THREAT_LEVEL.RATE_LIMITED]: "Too many requests",
  [THREAT_LEVEL.CAPTCHA]: "CAPTCHA",
  [THREAT_LEVEL.PARSE_ERROR]: "Unexpected crash",
  [THREAT_LEVEL.TIMEOUT]: "Timeout",
  [THREAT_LEVEL.NETWORK]: "Connection error",
  [THREAT_LEVEL.INTERSTITIAL]: "Access denied",
};

const UNKNOWN_ERROR_TEXT = "Unexpected crash";

export interface SearxResult {
  url: string;
  title: string;
  content: string;
  engine: string;
  engines: string[];
  category: string;
  template: string;
  score: number;
  positions: number[];
  parsed_url: string[];
  publishedDate: string | null;
  img_src: string;
  thumbnail: string;
  iframe_src: string;
  audio_src: string;
  length: string;
  views: string;
  author: string;
  metadata: string;
}

export interface SearxDocument {
  query: string;
  results: SearxResult[];
  answers: string[];
  corrections: string[];
  infoboxes: string[];
  suggestions: string[];
  unresponsive_engines: string[][];
}

export const isSearxFormat = (raw?: string | null): boolean =>
  (raw ?? "").trim().toLowerCase() === SEARX_FORMAT_VALUE;

const toCategory = (type: string): string => {
  const key = (type || "web").toLowerCase();
  if (TYPE_TO_CATEGORY[key]) return TYPE_TO_CATEGORY[key];
  return KNOWN_CATEGORIES.has(key) ? key : SEARX_CATEGORY.GENERAL;
};

const toTemplate = (category: string): string =>
  CATEGORY_TO_TEMPLATE[category] ?? SEARX_TEMPLATE.DEFAULT;

const parseUrl = (raw: string): string[] => {
  try {
    const u = new URL(raw);
    return [
      u.protocol.replace(":", ""),
      u.host,
      u.pathname,
      "",
      u.search.replace("?", ""),
      u.hash.replace("#", ""),
    ];
  } catch {
    logger.debug(NS, "malformed result url, falling back to a bare path shape");
    return ["", "", raw, "", "", ""];
  }
};

const engineCodes = async (): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  try {
    for (const e of await listEngines()) {
      map.set(e.displayName.toLowerCase(), e.id);
    }
  } catch (err) {
    logger.warn(NS, "engine code lookup failed, falling back to display names", err);
  }
  return map;
};

const toCode = (name: string, codes: Map<string, string>): string =>
  codes.get(name.toLowerCase()) ?? name.toLowerCase();

const deadEngines = (
  timings: EngineTiming[],
  codes: Map<string, string>,
): string[][] =>
  timings
    .filter((t) => t.status !== undefined && t.status !== THREAT_LEVEL.OK)
    .map((t) => [
      toCode(t.name, codes),
      ERROR_TEXT[t.status ?? ""] ?? UNKNOWN_ERROR_TEXT,
    ])
    .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

const toSearxResult = (
  r: ScoredResult,
  index: number,
  category: string,
  codes: Map<string, string>,
): SearxResult => ({
  url: r.url,
  title: r.title,
  content: r.snippet,
  engine: toCode(r.source, codes),
  engines: (r.sources ?? [r.source]).map((s) => toCode(s, codes)),
  category,
  template: toTemplate(category),
  score: r.score,
  positions: [index + 1],
  parsed_url: parseUrl(r.url),
  publishedDate: null,
  img_src: r.imageUrl ?? "",
  thumbnail: r.thumbnail ?? "",
  iframe_src: "",
  audio_src: "",
  length: r.duration ?? "",
  views: "",
  author: "",
  metadata: "",
});

export const toSearxDoc = async (
  response: Pick<SearchResponse, "results" | "engineTimings"> &
    Partial<Pick<SearchResponse, "query" | "type" | "relatedSearches">>,
): Promise<SearxDocument> => {
  const codes = await engineCodes();
  const category = toCategory(response.type ?? "web");

  return {
    query: response.query ?? "",
    results: response.results.map((r, i) => toSearxResult(r, i, category, codes)),
    answers: [],
    corrections: [],
    infoboxes: [],
    suggestions: response.relatedSearches ?? [],
    unresponsive_engines: deadEngines(response.engineTimings ?? [], codes),
  };
};
