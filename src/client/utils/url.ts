import { SearchBody } from "../../server/types";
import { state } from "../state";
import { getBase } from "./base-url";

export const proxyImageUrl = (url: string): string => {
  if (!url) return "";
  if (url.includes("/api/proxy/")) return url;
  return `${getBase()}/api/proxy/image?url=${encodeURIComponent(url)}`;
};

export const faviconHostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

export const faviconUrl = (url: string): string => {
  const hostname = faviconHostname(url);
  if (!hostname) return "";
  return `${getBase()}/api/proxy/favicon?domain=${encodeURIComponent(hostname)}`;
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
  if (type === "images") {
    const f = state.imageFilter;
    if (f.color && f.color !== "any") params.set("imgColor", f.color);
    if (f.size && f.size !== "any") params.set("imgSize", f.size);
    if (f.type && f.type !== "any") params.set("imgType", f.type);
    if (f.layout && f.layout !== "any") params.set("imgLayout", f.layout);
    if (f.nsfw && f.nsfw !== "any") params.set("imgNsfw", f.nsfw);
  }
  return params;
};

export const buildSearchUrl = (
  query: string,
  engines: Record<string, boolean>,
  type: string,
  page: number,
): string =>
  `${getBase()}/api/search?${buildSearchParams(query, engines, type, page).toString()}`;

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
  if (type === "images") {
    const f = state.imageFilter;
    if (f.color && f.color !== "any") body.imgColor = f.color;
    if (f.size && f.size !== "any") body.imgSize = f.size;
    if (f.type && f.type !== "any") body.imgType = f.type;
    if (f.layout && f.layout !== "any") body.imgLayout = f.layout;
    if (f.nsfw && f.nsfw !== "any") body.imgNsfw = f.nsfw;
  }

  return body;
};
