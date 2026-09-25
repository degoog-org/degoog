import { isWebUrl } from "../engine-bridge";

const MAX_REDIRECTS = 5;
const STRIP_CROSS_ORIGIN = new Set(["cookie", "authorization"]);
const STRIP_ON_REWRITE = new Set([
  "content-type",
  "content-length",
  "content-encoding",
  "content-language",
  "content-location",
]);

export const isHttpRedirect = (status: number): boolean =>
  status >= 300 && status < 400;

const _origin = (raw: string): string | null => {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
};

const _without = (
  headers: Record<string, string>,
  names: Set<string>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!names.has(key.toLowerCase())) out[key] = value;
  }
  return out;
};

const _rewritesToGet = (status: number, method: string): boolean => {
  if (status === 303) return method !== "GET" && method !== "HEAD";
  return (status === 301 || status === 302) && method === "POST";
};

export type EngineFetcher = (
  url: string,
  init: {
    headers: Record<string, string>;
    redirect: RequestRedirect;
    method?: string;
    body?: string;
  },
) => Promise<Response>;

export const followEngineFetch = async (
  fetcher: EngineFetcher,
  req: {
    url: string;
    method: string;
    headers: Record<string, string>;
    data?: string;
    follow?: boolean;
  },
): Promise<Response> => {
  if (!isWebUrl(req.url)) throw new Error("only http(s) requests are allowed");
  let url = req.url;
  let method = req.method.toUpperCase();
  let headers = { ...req.headers };
  let data = req.data;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const resp = await fetcher(url, {
      headers,
      redirect: "manual",
      ...(method !== "GET" ? { method } : {}),
      ...(data ? { body: data } : {}),
    });
    if (!req.follow || !isHttpRedirect(resp.status) || hop === MAX_REDIRECTS) {
      return resp;
    }
    const loc = resp.headers.get("location");
    if (!loc) return resp;
    let next: string;
    try {
      next = new URL(loc, url).href;
    } catch {
      return resp;
    }
    if (!isWebUrl(next)) throw new Error("only http(s) responses are allowed");
    if (_rewritesToGet(resp.status, method)) {
      method = "GET";
      data = undefined;
      headers = _without(headers, STRIP_ON_REWRITE);
    }
    const from = _origin(url);
    const to = _origin(next);
    if (!from || !to || from !== to) headers = _without(headers, STRIP_CROSS_ORIGIN);
    url = next;
  }
  throw new Error("too many redirects");
};
