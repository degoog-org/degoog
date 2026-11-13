import { isIP } from "node:net";
import type { EngineFetch } from "../types/search";
import { logger } from "../utils/logger";
import { isSafeHost } from "../utils/security/ssrf";

export const MAX_REDIRECT_HOPS = 3;
export const MAX_REDIRECT_RESOLVES = 30;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const WEB_PROTOCOLS = new Set(["http:", "https:"]);

export interface RedirectResolverOptions {
  enabled: () => Promise<boolean>;
  fetchedHosts: ReadonlySet<string>;
}

const _webUrl = (raw: string, base?: string): URL | null => {
  try {
    const parsed = new URL(raw, base);
    if (!WEB_PROTOCOLS.has(parsed.protocol)) return null;
    parsed.username = "";
    parsed.password = "";
    return parsed;
  } catch {
    return null;
  }
};

const _within = (host: string, base: string): boolean =>
  host === base || host.endsWith(`.${base}`);

// Drops the first label so www.example.com covers redirect.example.com
const _parentOf = (host: string): string => {
  const labels = host.split(".");
  return labels.length > 2 ? labels.slice(1).join(".") : host;
};

export const isEngineSite = (host: string, fetchedHosts: Iterable<string>): boolean => {
  for (const fetched of fetchedHosts) {
    if (host === fetched) return true;
    if (isIP(fetched) || isIP(host)) continue;
    if (_within(host, _parentOf(fetched))) return true;
  }
  return false;
};

// Fails closed on anything but a 3xx with Location, e.g. a transport that followed it itself.
const _hop = async (fetch: EngineFetch, url: URL): Promise<URL | null> => {
  if (!(await isSafeHost(url.hostname))) return null;
  const res = await fetch(url.href, { redirect: "manual" });
  await res.body?.cancel().catch(() => {});
  const location = res.headers.get("location");
  if (!REDIRECT_STATUSES.has(res.status) || !location) return null;
  return _webUrl(location, url.href);
};

const _unwrap = async (fetch: EngineFetch, start: URL): Promise<string | null> => {
  let current = start;
  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const next = await _hop(fetch, current);
    if (!next) return null;
    // Leaving the engine's origin means we found the destination.
    if (next.origin !== start.origin) return next.href;
    current = next;
  }
  return null;
};

export const makeRedirectResolver = (
  fetch: EngineFetch,
  { enabled, fetchedHosts }: RedirectResolverOptions,
): ((url: string) => Promise<string | null>) => {
  let budget = MAX_REDIRECT_RESOLVES;
  let allowed: Promise<boolean> | undefined;
  return async (url) => {
    const start = _webUrl(url);
    if (!start || budget <= 0) return null;
    try {
      allowed ??= enabled();
      // Recheck the budget after the await so concurrent calls can't all slip past.
      if (!(await allowed) || budget <= 0) return null;
      if (!isEngineSite(start.hostname, fetchedHosts)) return null;
      budget--;
      return await _unwrap(fetch, start);
    } catch (err) {
      logger.debug("engine-redirects", `could not resolve redirect on ${start.hostname}`, err);
      return null;
    }
  };
};
