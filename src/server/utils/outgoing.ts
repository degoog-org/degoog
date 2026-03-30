import { getSettings } from "./plugin-settings";
import { debug } from "./logger";
import { isSocksProxy, fetchViaSocks } from "./socks-fetch";
import { fetchViaHttpProxy } from "./http-proxy-fetch";

export interface OutgoingFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: RequestRedirect;
  signal?: AbortSignal;
}

const DEGOOG_SETTINGS_ID = "degoog-settings";

let allowedHosts: Set<string> | null = null;

export function setOutgoingAllowlist(hosts: string[]): void {
  if (!hosts || hosts.length === 0) {
    allowedHosts = new Set();
    return;
  }
  const normalized = hosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
  const extra = process.env.DEGOOG_OUTGOING_ALLOWED_HOSTS ?? "";
  const fromEnv = extra
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  allowedHosts = new Set([...normalized, ...fromEnv]);
}

let proxyIndex = 0;

function parseProxyUrls(raw: string): string[] {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isUrlAllowedForOutgoing(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return false;
  } catch {
    return false;
  }
  if (!allowedHosts) return true;
  if (allowedHosts.size === 0) return false;
  if (allowedHosts.has("*")) return true;
  const host = new URL(url).hostname.toLowerCase();
  return allowedHosts.has(host);
}

export async function outgoingFetch(
  url: string,
  options: OutgoingFetchOptions = {},
): Promise<Response> {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  const enabled = settings.proxyEnabled === "true";
  const proxyUrlsRaw = settings.proxyUrls;
  const urls = parseProxyUrls(
    typeof proxyUrlsRaw === "string" ? proxyUrlsRaw : "",
  );

  const useProxy = enabled && urls.length > 0;
  const method = options.method ?? "GET";
  const redirect = options.redirect ?? "follow";
  const signal = options.signal;
  const headers = options.headers;
  const body = options.body;

  if (!useProxy) {
    debug("outgoing", `direct fetch ${new URL(url).hostname}`);
    return fetch(url, { method, redirect, signal, headers, body });
  }

  const proxyUrl = urls[proxyIndex++ % urls.length];
  debug("outgoing", `via proxy ${proxyUrl} -> ${new URL(url).hostname}`);

  if (isSocksProxy(proxyUrl)) {
    return fetchViaSocks(url, proxyUrl, {
      method,
      redirect,
      signal,
      headers,
      body: body ?? undefined,
    });
  }

  return fetchViaHttpProxy(url, proxyUrl, {
    method,
    redirect,
    signal,
    headers,
    body: body ?? undefined,
  });
}
