import type { SearchBody } from "../../../server/types/search";
import type { ImageFilter } from "../../types/search";
import { state } from "../../state";
import { getBase } from "./base-url";
import { appendSearchAuthParams, searchAuthHeaders } from "./request";
import { isImageSearchType } from "../../../shared/search-types";
import { enabledIds, getEngineBangs, getEngines } from "../search/engines";
import { ENGINE_BANGS_FIELD } from "../../../shared/sync";
import { REGION_PARAM } from "../../../shared/region";
import {
  currentSearchImage,
  withSearchImage,
} from "../../modules/search-image/search-image";

export const imgFilterRecord = (f: ImageFilter): Record<string, string> => {
  const r: Record<string, string> = {};
  if (f.color && f.color !== "any") r.imgColor = f.color;
  if (f.size && f.size !== "any") r.imgSize = f.size;
  if (f.type && f.type !== "any") r.imgType = f.type;
  if (f.layout && f.layout !== "any") r.imgLayout = f.layout;
  if (f.nsfw && f.nsfw !== "any") r.safeMode = f.nsfw;
  return r;
};

export const readImgFilter = (p: URLSearchParams): ImageFilter => {
  const f: ImageFilter = {};
  const color = p.get("imgColor");
  const size = p.get("imgSize");
  const type = p.get("imgType");
  const layout = p.get("imgLayout");
  const nsfw = p.get("safeMode") ?? p.get("imgNsfw");
  if (color && color !== "any") f.color = color;
  if (size && size !== "any") f.size = size;
  if (type && type !== "any") f.type = type;
  if (layout && layout !== "any") f.layout = layout;
  if (nsfw && nsfw !== "any") f.nsfw = nsfw;
  return f;
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
  if (state.currentRegion) {
    params.set(REGION_PARAM, state.currentRegion);
  }
  if (isImageSearchType(type)) {
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
    engines: enabledIds(engines),
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
  if (state.currentRegion) body.region = state.currentRegion;
  if (isImageSearchType(type)) {
    Object.assign(body, imgFilterRecord(state.imageFilter));
  }

  return body;
};

const _postSearchJson = (path: string, body: SearchBody): Promise<Response> =>
  fetch(`${getBase()}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...searchAuthHeaders() },
  });

export const fetchSearch = (
  query: string,
  engines: Record<string, boolean>,
  type: string,
  page: number,
): Promise<Response> =>
  state.postMethodEnabled || currentSearchImage()
    ? _postSearchJson(
        "/api/search",
        withSearchImage(buildSearchBody(query, engines, type, page)),
      )
    : fetch(appendSearchAuthParams(buildSearchUrl(query, engines, type, page)));

export const fetchCommand = async (
  query: string,
  type: string,
  page: number,
): Promise<Response> => {
  const [engines, bangs] = await Promise.all([getEngines(), getEngineBangs()]);
  if (state.postMethodEnabled) {
    return _postSearchJson("/api/command", {
      ...buildSearchBody(query, engines, type, page),
      bangs: enabledIds(bangs),
    });
  }
  const params = buildSearchParams(query, engines, type, page);
  params.set(ENGINE_BANGS_FIELD, enabledIds(bangs).join(","));
  return fetch(
    appendSearchAuthParams(`${getBase()}/api/command?${params.toString()}`),
  );
};

export const fetchResultsPage = async (
  type: string,
  page: number,
): Promise<Response> =>
  state.currentBangQuery
    ? fetchCommand(state.currentBangQuery, type, page)
    : fetchSearch(state.currentQuery, await getEngines(), type, page);
