import type { EngineContext } from "../../types/search";
import { getRandomUserAgent } from "../../utils/net/user-agents";
import { useCache } from "../../utils/cache/cache";
import type { RpcFetchReply, RpcHandlers } from "./rpc";

const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";
const CACHE_TTL_MS = 60 * 60 * 1000;

export const isWebUrl = (raw: string): boolean => {
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const _headersObject = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

const _setCookies = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (eq <= 0) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
};

const _cookieHeader = (cookies: Record<string, string> | undefined): string =>
  Object.entries(cookies ?? {})
    .filter(([key, value]) => key.trim() && String(value).trim())
    .map(([key, value]) => `${key.trim()}=${String(value).trim()}`)
    .join("; ");

export const withCookies = (
  headers: Record<string, string>,
  cookies: Record<string, string> | undefined,
): Record<string, string> => {
  const cookie = _cookieHeader(cookies);
  if (cookie && !Object.keys(headers).some((key) => key.toLowerCase() === "cookie")) {
    headers.Cookie = cookie;
  }
  return headers;
};

export const browserHeaders = (context?: EngineContext): Record<string, string> => ({
  "User-Agent": context?.userAgent?.() ?? getRandomUserAgent(),
  "Accept-Language": context?.buildAcceptLanguage?.() ?? DEFAULT_ACCEPT_LANGUAGE,
});

export const toReply = async (resp: Response, fallbackUrl: string): Promise<RpcFetchReply> => ({
  url: resp.url || fallbackUrl,
  status: resp.status,
  headers: _headersObject(resp.headers),
  cookies: _setCookies(resp.headers),
  text: await resp.text(),
});

export const cacheHandler = (namespace: string, engineId: string): RpcHandlers["onCache"] => {
  const store = useCache<string>(`${namespace}:${engineId}`, CACHE_TTL_MS);
  return async (req) => {
    if (req.op === "set") {
      await store.set(req.key, req.value ?? "", req.ttl ? req.ttl * 1000 : undefined);
      return null;
    }
    return store.get(req.key);
  };
};
