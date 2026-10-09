/**
 * @fccview here
 * scraping is a crazy business. This shit is hard.
 * For example, our big G has very strict TLS policies, which means sometimes it'll
 * randomly block bun's fetch.
 *
 * The best solution I could come up with is to use curl binaries as fallback for requests.
 * Until/if bun implements TLS pinning, this is the best we can do.
 *
 * Also bun doesn't support socks5 proxies, so we use a separate library for that. How fun.
 *
 */

import { fetch as bunFetch } from "bun";
import { resolveTransport } from "../../extensions/transports/registry";
import type {
  ProxyAwareFetch,
  Transport,
  TransportContext,
  TransportFetchOptions,
  TransportImpersonate,
} from "../../types/extension";
import { useCache } from "../cache/cache";
import { fetchViaHttpProxy } from "./http-proxy-fetch";
import { logger } from "../logger";
import { fetchViaSocks, isSocksProxy } from "./socks-fetch";
import { getInstanceSettings } from "../settings/server-settings";
import { asBoolean } from "../settings/plugin-settings";
import { rosterIdFor } from "./proxy-roster";
import { impersonateAvailable, impersonateFetch } from "./impersonate";
import { benchedUntil, jerseyFor } from "./proxy-bench";
export function parseOutgoingTransport(raw: string | undefined): string {
  return raw?.trim() || "fetch";
}

const ALLOWED_HOSTS_ENV = "DEGOOG_OUTGOING_ALLOWED_HOSTS";
const ANY_HOST = "*";
const SUBDOMAIN_WILDCARD = "*.";

export const parseAllowedHosts = (raw: string | undefined): string[] | null => {
  const hosts = (raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : null;
};

let _envAllowedHosts: string[] | null | undefined;

const _allowedHosts = (): string[] | null => {
  if (_envAllowedHosts === undefined) {
    _envAllowedHosts = parseAllowedHosts(process.env[ALLOWED_HOSTS_ENV]);
  }
  return _envAllowedHosts;
};

const _hostMatches = (host: string, pattern: string): boolean => {
  if (pattern === ANY_HOST) return true;
  if (pattern.startsWith(SUBDOMAIN_WILDCARD)) {
    return host.endsWith(pattern.slice(SUBDOMAIN_WILDCARD.length - 1));
  }
  return host === pattern;
};

export const isUrlAllowedForOutgoing = (
  url: string,
  allowed: string[] | null = _allowedHosts(),
): boolean => {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!allowed) return true;
  return allowed.some((pattern) => _hostMatches(host, pattern));
};

let proxyIndex = 0;

const PROXY_ENV_PLACEHOLDER_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function envNameOk(name: string): boolean {
  const allowlist = process.env.DEGOOG_PROXY_ENV_ALLOWLIST ?? "";
  return allowlist
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      if (entry === "*") return true;
      if (entry.endsWith("*")) return name.startsWith(entry.slice(0, -1));
      return name === entry;
    });
}

export function proxyEnv(value: string): string {
  return value.replace(PROXY_ENV_PLACEHOLDER_RE, (match, name: string) => {
    if (!envNameOk(name)) return match;
    return process.env[name] ?? match;
  });
}

const MASKED_PROXY = "***";

export function maskProxy(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.username) parsed.username = "***";
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return MASKED_PROXY;
  }
}

function parseProxyUrlsList(rawList: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawList) {
    if (typeof raw !== "string") continue;
    for (const line of raw.split("\n")) {
      const trimmed = proxyEnv(line.trim());
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

const _asList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : typeof value === "string"
      ? [value]
      : [];

function _buildProxyFetch(
  proxyUrl?: string,
  timeoutMs?: number,
  reuseKey?: string,
): ProxyAwareFetch {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const redirect = init?.redirect ?? "follow";
    const signal = init?.signal ?? undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    const body = typeof init?.body === "string" ? init.body : undefined;

    if (!proxyUrl) {
      return bunFetch(url, { method, redirect, signal, headers, body });
    }

    const proxied = { method, redirect, signal, headers, body };
    if (isSocksProxy(proxyUrl)) {
      return fetchViaSocks(url, proxyUrl, proxied, timeoutMs, reuseKey);
    }
    return fetchViaHttpProxy(url, proxyUrl, proxied, timeoutMs, reuseKey);
  };
}

export interface OutgoingProxyOptions {
  proxyOverrideEnabled?: boolean;
  proxyOverrideUrls?: string | string[];
}

export interface OutgoingFetchOptions extends OutgoingProxyOptions {
  engineId?: string;
  pinnedProxy?: Batter | null;
  sessionKey?: string;
}

export interface Batter {
  url: string;
  id: string;
}

const _proxyUrls = async (opts?: OutgoingProxyOptions): Promise<string[]> => {
  if (opts?.proxyOverrideEnabled === true) {
    return parseProxyUrlsList(_asList(opts.proxyOverrideUrls));
  }
  const settings = await getInstanceSettings();
  if (!asBoolean(settings.proxyEnabled)) return [];
  return parseProxyUrlsList(_asList(settings.proxyUrls));
};

export const lineupUrls = (): Promise<string[]> => _proxyUrls();

const _firstOffTheBench = (untils: number[]): number =>
  untils.indexOf(Math.min(...untils));

const _suitUp = (url: string): Batter => ({ url, id: rosterIdFor(url) });

export async function pickBatter(
  opts?: OutgoingProxyOptions,
  host?: string,
  preferredId?: string,
): Promise<Batter | undefined> {
  const urls = await _proxyUrls(opts);
  if (urls.length === 0) return undefined;
  const preferred = preferredId
    ? urls.find((url) => rosterIdFor(url) === preferredId)
    : undefined;
  if (preferred && (!host || (await benchedUntil(preferredId!, host)) === 0)) {
    return _suitUp(preferred);
  }
  const start = proxyIndex++;
  const ordered = urls.map((_, i) => urls[(start + i) % urls.length]);
  if (!host) return _suitUp(ordered[0]);
  const untils = await Promise.all(ordered.map((url) => benchedUntil(rosterIdFor(url), host)));
  const free = untils.indexOf(0);
  return _suitUp(ordered[free >= 0 ? free : _firstOffTheBench(untils)]);
}

async function buildTransportContext(
  transportName: string,
  host: string,
  opts?: OutgoingFetchOptions,
): Promise<{ transport: Transport; context: TransportContext }> {
  const proxy =
    opts?.pinnedProxy !== undefined
      ? opts.pinnedProxy ?? undefined
      : await pickBatter(opts, host);
  const transport = resolveTransport(transportName);
  const egressKey = await jerseyFor(proxy?.id, host);
  const impersonate: TransportImpersonate | undefined = (await impersonateAvailable())
    ? (request) =>
        impersonateFetch({
          ...request,
          proxyUrl: request.proxyUrl ?? proxy?.url,
          egressKey: request.egressKey ?? egressKey,
        })
    : undefined;
  return {
    transport,
    context: {
      proxyUrl: proxy?.url,
      egressKey,
      engineId: opts?.engineId,
      sessionKey: opts?.sessionKey,
      fetch: _buildProxyFetch(proxy?.url, transport.timeoutMs, proxy ? egressKey : undefined),
      ...(impersonate ? { impersonate } : {}),
      useCache,
    },
  };
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const _assertAllowed = (url: string, allowed: string[] | null): void => {
  if (isUrlAllowedForOutgoing(url, allowed)) return;
  const parsed = new URL(url);
  const host = parsed.hostname || parsed.protocol;
  logger.warn("outgoing", `${ALLOWED_HOSTS_ENV} refused -> ${host}`);
  throw new Error(`Outgoing host not allowed: ${host}`);
};

const _nextHopOptions = (
  status: number,
  options: TransportFetchOptions,
  crossOrigin: boolean,
): TransportFetchOptions => {
  const method = (options.method ?? "GET").toUpperCase();
  const toGet =
    status === 303
      ? method !== "HEAD"
      : (status === 301 || status === 302) && method === "POST";
  const next: TransportFetchOptions = toGet
    ? { ...options, method: "GET", body: undefined }
    : options;
  if (!crossOrigin || !next.headers) return next;
  const headers = Object.fromEntries(
    Object.entries(next.headers).filter(
      ([k]) => !["authorization", "cookie"].includes(k.toLowerCase()),
    ),
  );
  return { ...next, headers };
};

export const fetchWithinAllowlist = async (
  transport: Pick<Transport, "fetch">,
  url: string,
  options: TransportFetchOptions,
  context: TransportContext,
  allowed: string[] | null,
): Promise<Response> => {
  let current = url;
  let hopOptions: TransportFetchOptions = {
    ...options,
    redirect: "manual",
    allowlistHop: true,
  };
  for (let hop = 0; ; hop++) {
    const res = await transport.fetch(current, hopOptions, context);
    const location = res.headers.get("location");
    if (!REDIRECT_STATUSES.has(res.status) || !location) return res;
    if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects: ${url}`);
    const next = new URL(location, current).href;
    _assertAllowed(next, allowed);
    await res.body?.cancel().catch(() => {});
    hopOptions = _nextHopOptions(
      res.status,
      hopOptions,
      new URL(next).origin !== new URL(current).origin,
    );
    current = next;
  }
};

export async function outgoingFetch(
  url: string,
  options: TransportFetchOptions = {},
  transportName: string = "fetch",
  ctx?: OutgoingFetchOptions,
): Promise<Response> {
  const allowed = _allowedHosts();
  _assertAllowed(url, allowed);
  const host = new URL(url).hostname;
  const { transport, context } = await buildTransportContext(transportName, host, ctx);
  if (context.proxyUrl) {
    logger.debug(
      "outgoing",
      `${transport.name} via ${maskProxy(context.proxyUrl)} -> ${host}`,
    );
  } else {
    logger.debug("outgoing", `${transport.name} -> ${host}`);
  }
  const followsRedirects = (options.redirect ?? "follow") === "follow";
  if (!allowed || !followsRedirects) {
    return transport.fetch(url, options, context);
  }
  return fetchWithinAllowlist(transport, url, options, context, allowed);
}
