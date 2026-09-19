const MAX_REDIRECTS = 5;
const STRIP_CROSS_ORIGIN = new Set(["cookie", "authorization"]);

export const isHttpRedirect = (status: number): boolean =>
  status >= 300 && status < 400;

export const isWebUrl = (raw: string): boolean => {
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

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
  const method = req.method;
  let headers = { ...req.headers };
  const data = req.data;
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
    const from = _origin(url);
    const to = _origin(next);
    if (!from || !to || from !== to) headers = _without(headers, STRIP_CROSS_ORIGIN);
    url = next;
  }
  throw new Error("too many redirects");
};
