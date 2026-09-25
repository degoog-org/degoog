import type { Context } from "hono";
import { getBasePath } from "../utils/net/base-url";
import { logger } from "../utils/logger";

const BASE_PATH = getBasePath();

export const NOJS_SEGMENT = "/nojs";
export const RETRY_PARAM = "retry";

const MAX_LOGGED_PATH = 120;

export interface NojsQuery {
  q: string;
  type?: string;
  page?: number;
  time?: string;
  lang?: string;
  dateFrom?: string;
  dateTo?: string;
}

let strippedPrefixWarned = false;

const _safePath = (path: string): string =>
  path.replace(/[\x00-\x1f\x7f]/g, "").slice(0, MAX_LOGGED_PATH);

const _warnStrippedPrefix = (path: string, mounted: string): void => {
  if (strippedPrefixWarned) return;
  strippedPrefixWarned = true;
  logger.warn(
    "nojs",
    `a no-JS page was rendered for "${_safePath(path)}", which is not under "${mounted}". ` +
      `Every link on that page now points at the full JavaScript app, so visitors look like they are being bounced off the no-JS page. ` +
      `The usual cause is a reverse proxy stripping the "${NOJS_SEGMENT}" prefix, such as "proxy_pass http://host:port/nojs/". Pass the original path through unchanged instead.`,
  );
};

const nojsPrefix = (c: Context): string => {
  const mounted = `${BASE_PATH}${NOJS_SEGMENT}`;
  const path = c.req.path;
  if (path === mounted || path.startsWith(`${mounted}/`)) return mounted;
  _warnStrippedPrefix(path, mounted);
  return BASE_PATH;
};

export const nojsHome = (c: Context): string => nojsPrefix(c) || "/";

export const nojsSearchAction = (c: Context): string =>
  `${nojsPrefix(c)}/search`;

export const searchParams = (query: NojsQuery): URLSearchParams => {
  const params = new URLSearchParams({ q: query.q });
  if (query.type) params.set("type", query.type);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.time && query.time !== "any") params.set("time", query.time);
  if (query.lang) params.set("lang", query.lang);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  return params;
};

export const searchHref = (c: Context, query: NojsQuery): string =>
  `${nojsSearchAction(c)}?${searchParams(query).toString()}`;

export const retryHref = (
  c: Context,
  query: NojsQuery,
  engine: string,
): string => {
  const params = searchParams(query);
  params.set(RETRY_PARAM, engine);
  return `${nojsSearchAction(c)}?${params.toString()}`;
};

export const fullAppHref = (): string => `${BASE_PATH}/` || "/";