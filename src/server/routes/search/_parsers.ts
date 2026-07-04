import type { Context } from "hono";
import {
  getDefaultEngineConfig,
  listEngineIds,
} from "../../extensions/engines/registry";
import type { EngineConfig, ImageFilter, ImgColor, ImgLayout, ImgNsfw, ImgSize, ImgType, SearchParams, SearchType, TimeFilter } from "../../types";
import { parseEngineConfig } from "../../utils/search";

export const SAFE_MODE_PARAM = "safeMode";
export const LEGACY_SAFE_MODE_PARAM = "imgNsfw";

export function parsePage(raw: unknown): number {
  return Math.max(1, Math.min(10, Math.floor(Number(raw)) || 1));
}

export function parseEnginesFromBody(enabledList?: string[]): EngineConfig {
  if (!enabledList) return getDefaultEngineConfig();
  const enabledSet = new Set(enabledList);
  const engines: EngineConfig = {};
  for (const id of listEngineIds()) {
    engines[id] = enabledSet.has(id);
  }
  return engines;
}

export const parseSearchRequest = (c: Context): Omit<SearchParams, "query"> & { origQ: string } => ({
  origQ: c.req.query("q") ?? "",
  engines: parseEngineConfig(new URL(c.req.url).searchParams),
  searchType: (c.req.query("type") || "web") as SearchType,
  page: parsePage(c.req.query("page")),
  timeFilter: (c.req.query("time") || "any") as TimeFilter,
  lang: c.req.query("lang") || "",
  dateFrom: c.req.query("dateFrom") || "",
  dateTo: c.req.query("dateTo") || "",
  imageFilter: parseImageFilter(
    c.req.query("imgColor"),
    c.req.query("imgSize"),
    c.req.query("imgType"),
    c.req.query("imgLayout"),
    c.req.query(SAFE_MODE_PARAM) ?? c.req.query(LEGACY_SAFE_MODE_PARAM),
  ),
});

export function parseImageFilter(
  color?: string | null,
  size?: string | null,
  type?: string | null,
  layout?: string | null,
  nsfw?: string | null,
): ImageFilter | undefined {
  const f: ImageFilter = {};
  if (color && color !== "any") f.color = color as ImgColor;
  if (size && size !== "any") f.size = size as ImgSize;
  if (type && type !== "any") f.type = type as ImgType;
  if (layout && layout !== "any") f.layout = layout as ImgLayout;
  if (nsfw && nsfw !== "any") f.nsfw = nsfw as ImgNsfw;
  return Object.keys(f).length > 0 ? f : undefined;
}
