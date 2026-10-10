import type { Context } from "hono";
import { getDefaultEngineConfig } from "../../extensions/engines/catalog";
import { listEngineIds } from "../../extensions/engines/loader";
import type {
  EngineConfig,
  ImageFilter,
  ImgColor,
  ImgLayout,
  ImgNsfw,
  ImgSize,
  ImgType,
  SearchBody,
  SearchParams,
  SearchType,
  TimeFilter,
} from "../../types/search";
import { parseEngineConfig } from "../../utils/search";
import { sanePage } from "../../search/page-counter";
import { parseImageQuery, parseSearchImage } from "../../search/search-image";
import { normalizeRegion, REGION_PARAM } from "../../../shared/region";

export const SAFE_MODE_PARAM = "safeMode";
export const LEGACY_SAFE_MODE_PARAM = "imgNsfw";

export function parseEnginesFromBody(enabledList?: string[]): EngineConfig {
  if (!enabledList) return getDefaultEngineConfig();
  const enabledSet = new Set(enabledList);
  const engines: EngineConfig = {};
  for (const id of listEngineIds()) {
    engines[id] = enabledSet.has(id);
  }
  return engines;
}

type ParsedSearchRequest = Omit<SearchParams, "query"> & { origQ: string };

const _parseSearchFields = (
  read: (key: string) => string | null | undefined,
  engines: EngineConfig,
): ParsedSearchRequest => ({
  origQ: read("q") ?? "",
  engines,
  searchType: (read("type") || "web") as SearchType,
  page: sanePage(read("page")),
  timeFilter: (read("time") || "any") as TimeFilter,
  lang: read("lang") || "",
  region: normalizeRegion(read(REGION_PARAM)),
  dateFrom: read("dateFrom") || "",
  dateTo: read("dateTo") || "",
  imageFilter: parseImageFilter(
    read("imgColor"),
    read("imgSize"),
    read("imgType"),
    read("imgLayout"),
    read(SAFE_MODE_PARAM) ?? read(LEGACY_SAFE_MODE_PARAM),
  ),
});

export const parseSearchRequest = (c: Context): ParsedSearchRequest =>
  _parseSearchFields(
    (key) => c.req.query(key),
    parseEngineConfig(new URL(c.req.url).searchParams),
  );

export const parseSearchParams = (params: URLSearchParams): ParsedSearchRequest =>
  _parseSearchFields((key) => params.get(key), parseEngineConfig(params));

export const parseSearchForm = (form: FormData): ParsedSearchRequest =>
  _parseSearchFields((key) => {
    const value = form.get(key);
    return typeof value === "string" ? value : null;
  }, parseEnginesFromBody(undefined));

export const parseSearchBody = (body: SearchBody): Omit<SearchParams, "query"> => ({
  engines: parseEnginesFromBody(body.engines),
  searchType: (body.type || "web") as SearchType,
  page: sanePage(body.page),
  timeFilter: (body.time || "any") as TimeFilter,
  lang: body.lang || "",
  region: normalizeRegion(body.region),
  dateFrom: body.dateFrom || "",
  dateTo: body.dateTo || "",
  imageFilter: parseImageFilter(body.imgColor, body.imgSize, body.imgType, body.imgLayout, body.safeMode ?? body.imgNsfw),
  image: parseSearchImage(body.image),
  imageQuery: parseImageQuery(body.imageQuery),
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
