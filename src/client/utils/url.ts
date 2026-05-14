import { SearchBody } from "../../server/types";
import type { ImageFilter } from "../types/search";
import { state } from "../state";
import { getBase } from "./base-url";

export const imgFilterRecord = (f: ImageFilter): Record<string, string> => {
  const r: Record<string, string> = {};
  if (f.color && f.color !== "any") r.imgColor = f.color;
  if (f.size && f.size !== "any") r.imgSize = f.size;
  if (f.type && f.type !== "any") r.imgType = f.type;
  if (f.layout && f.layout !== "any") r.imgLayout = f.layout;
  if (f.nsfw && f.nsfw !== "any") r.imgNsfw = f.nsfw;
  return r;
};

export const readImgFilter = (p: URLSearchParams): ImageFilter => {
  const f: ImageFilter = {};
  const color = p.get("imgColor");
  const size = p.get("imgSize");
  const type = p.get("imgType");
  const layout = p.get("imgLayout");
  const nsfw = p.get("imgNsfw");
  if (color && color !== "any") f.color = color;
  if (size && size !== "any") f.size = size;
  if (type && type !== "any") f.type = type;
  if (layout && layout !== "any") f.layout = layout;
  if (nsfw && nsfw !== "any") f.nsfw = nsfw;
  return f;
};

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
    for (const [k, v] of Object.entries(imgFilterRecord(state.imageFilter))) {
      params.set(k, v);
    }
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
  if (type === "images") Object.assign(body, imgFilterRecord(state.imageFilter));

  return body;
};
