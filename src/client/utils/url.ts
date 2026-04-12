import { SearchBody } from "../../server/types";
import { state } from "../state";

export const proxyImageUrl = (url: string): string => {
  if (!url) return "";
  return `/api/proxy/image?url=${encodeURIComponent(url)}`;
};

export const faviconUrl = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    return proxyImageUrl(
      `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
    );
  } catch {
    return "";
  }
};

export const buildSearchParams = (
  query: string,
  engines: Record<string, boolean>,
  type: string,
  page: number,
): URLSearchParams => {
  const params = new URLSearchParams({ q: query });
  for (const [key, val] of Object.entries(engines)) {
    params.set(key, String(val));
  }
  if (type && type !== "web") {
    params.set("type", type);
  }
  if (page != null && page > 1) {
    params.set("page", String(page));
  }
  if (state.currentTimeFilter && state.currentTimeFilter !== "any") {
    params.set("time", state.currentTimeFilter);
  }
  if (state.currentTimeFilter === "custom") {
    if (state.customDateFrom) params.set("dateFrom", state.customDateFrom);
    if (state.customDateTo) params.set("dateTo", state.customDateTo);
  }
  if (state.currentLanguage) {
    params.set("lang", state.currentLanguage);
  }
  return params;
};

export const buildSearchUrl = (
  query: string,
  engines: Record<string, boolean>,
  type: string,
  page: number,
): string =>
  `/api/search?${buildSearchParams(query, engines, type, page).toString()}`;

export const buildSearchBody = (
  query: string,
  engines: Record<string, boolean>,
  type: string,
  page: number,
): SearchBody => {
  const body: SearchBody = {
    query,
    engines: Object.entries(engines)
      .filter(([, v]) => v)
      .map(([k]) => k),
  };

  if (type && type !== "web") body.type = type;
  if (page > 1) body.page = page;
  if (state.currentTimeFilter && state.currentTimeFilter !== "any") {
    body.time = state.currentTimeFilter;
  }
  if (state.currentTimeFilter === "custom") {
    if (state.customDateFrom) body.dateFrom = state.customDateFrom;
    if (state.customDateTo) body.dateTo = state.customDateTo;
  }
  if (state.currentLanguage) body.lang = state.currentLanguage;

  return body;
};
