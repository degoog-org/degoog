import type { Context } from "hono";
import { DEGOOG_ENGINE_NAME, type ScoredResult } from "../../shared/search-types";
import type { Translate } from "../types/extension";
import { getBasePath } from "../utils/net/base-url";
import { DEFAULT_LANGUAGES } from "../utils/search";
import { logger } from "../utils/logger";
import { searchHref, type NojsQuery } from "./links";
import { nojsTabType } from "./tabs";
import { cleanHostname, faviconHostname, linkHref } from "../../shared/utils/url";

const BASE_PATH = getBasePath();

const citeUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname + parsed.search;
  } catch {
    return url;
  }
};

const _dateLabel = (iso: string | undefined, locale: string): string => {
  if (!iso) return "";
  const when = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(when);
  } catch (err) {
    logger.debug("nojs", "could not format result date", err);
    return iso;
  }
};

export const faviconUrl = (url: string): string => {
  const hostname = faviconHostname(url);
  if (!hostname) return "";
  return `${BASE_PATH}/api/proxy/favicon?domain=${encodeURIComponent(hostname)}`;
};

export const buildResultContext = (
  result: ScoredResult,
  locale: string,
  index: number,
  isVideoType: boolean,
  t: Translate,
): Record<string, unknown> => {
  const recalled = result.idx === "recalled";
  const fromIndex = String(
    t("search-templates.result.from-index", undefined, locale),
  );
  return {
    index,
    title: result.title,
    url: linkHref(result.url),
    cite_url: citeUrl(result.url),
    snippet: result.snippet,
    published_at: _dateLabel(result.publishedAt, locale),
    favicon_url: faviconUrl(result.url),
    favicon_host: faviconHostname(result.url),
    thumbnail_url: result.thumbnail || result.imageUrl || "",
    duration: result.duration || "",
    is_video: isVideoType || !!result.duration,
    link_target: "_self",
    link_rel: "noopener noreferrer",
    insecure: !!result.insecure,
    show_actions: false,
    action_block: false,
    action_replace: false,
    action_score: false,
    sources: (result.sources ?? []).map((name) => ({
      name,
      tooltip: recalled && name === DEGOOG_ENGINE_NAME ? fromIndex : "",
    })),
  };
};

export interface NojsTab {
  id: string;
  name: string;
}

export const buildMediaContext = (
  result: ScoredResult,
): Record<string, unknown> => ({
  title: result.title,
  url: linkHref(result.url),
  thumbnail_url: result.thumbnail || result.imageUrl || "",
  fallback_url: result.thumbnail || "",
  duration: result.duration || "",
  hostname: cleanHostname(result.url),
  sources: (result.sources ?? []).map((name) => ({ name })),
});

export const buildTabsContext = (
  c: Context,
  tabs: NojsTab[],
  query: NojsQuery,
  currentType: string,
  toolsOpen: boolean,
): Record<string, unknown> => ({
  tools_open: toolsOpen,
  tabs: tabs.map((tab) => {
    const type = nojsTabType(tab.id);
    return {
      name: tab.name,
      href: searchHref(c, { ...query, type, page: 1 }),
      active_class: type === currentType ? "active" : "",
    };
  }),
});

const TIME_OPTIONS = [
  { value: "any", key: "search-templates.tabs.any-time" },
  { value: "hour", key: "search-templates.tabs.hour" },
  { value: "day", key: "search-templates.tabs.day" },
  { value: "week", key: "search-templates.tabs.week" },
  { value: "month", key: "search-templates.tabs.month" },
  { value: "year", key: "search-templates.tabs.year" },
];

const _languageLabel = (code: string, locale: string): string => {
  try {
    return (
      new Intl.DisplayNames([locale || "en"], { type: "language" }).of(code) ??
      code
    );
  } catch (err) {
    logger.debug("nojs", "could not resolve language name", err);
    return code;
  }
};

export const resolveLanguages = (
  enabled: boolean,
  raw: string,
): string[] => {
  if (!enabled) return DEFAULT_LANGUAGES;
  const codes = raw
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2,3}$/.test(s));
  return codes.length > 0 ? codes : DEFAULT_LANGUAGES;
};

export const buildToolsContext = (
  query: NojsQuery,
  languages: string[],
  locale: string,
  t: Translate,
): Record<string, unknown> => {
  const time = query.time && query.time !== "any" ? query.time : "any";
  const hasFilter =
    time !== "any" || !!query.lang || !!query.dateFrom || !!query.dateTo;
  return {
    query: query.q,
    type: query.type ?? "",
    open: hasFilter,
    date_from: query.dateFrom ?? "",
    date_to: query.dateTo ?? "",
    time_options: TIME_OPTIONS.map((option) => ({
      value: option.value,
      label: String(t(option.key, undefined, locale)),
      selected: option.value === time,
    })),
    languages:
      languages.length > 0
        ? [
            {
              value: "",
              label: String(t("search-templates.tabs.any", undefined, locale)),
              selected: !query.lang,
            },
            ...languages.map((code) => ({
              value: code,
              label: _languageLabel(code, locale),
              selected: code === query.lang,
            })),
          ]
        : [],
  };
};

const MAX_VISIBLE_PAGES = 10;

export const buildPaginationContext = (
  c: Context,
  query: NojsQuery,
  activePage: number,
  totalPages: number,
): Record<string, unknown> => {
  let startPage = Math.max(1, activePage - Math.floor(MAX_VISIBLE_PAGES / 2));
  const endPage = Math.min(totalPages, startPage + MAX_VISIBLE_PAGES - 1);
  if (endPage - startPage < MAX_VISIBLE_PAGES - 1) {
    startPage = Math.max(1, endPage - MAX_VISIBLE_PAGES + 1);
  }
  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push({
      number: i,
      current: i === activePage,
      href: searchHref(c, { ...query, page: i }),
    });
  }
  return {
    pages,
    prev_href:
      activePage > 1 ? searchHref(c, { ...query, page: activePage - 1 }) : "",
    next_href:
      activePage < totalPages
        ? searchHref(c, { ...query, page: activePage + 1 })
        : "",
  };
};
