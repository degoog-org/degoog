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
import { getSettings } from "./plugin-settings";
import { debug } from "./logger";
import { isSocksProxy, fetchViaSocks } from "./socks-fetch";
import { fetchViaCurl } from "./curl-fetch";

export interface OutgoingFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: RequestRedirect;
  signal?: AbortSignal;
}

const DEGOOG_SETTINGS_ID = "degoog-settings";

export type OutgoingTransport = "fetch" | "curl" | "auto";

export function parseOutgoingTransport(
  raw: string | undefined,
): OutgoingTransport {
  if (raw === "curl" || raw === "auto") return raw;
  return "fetch";
}

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

function shouldRetryWithCurl(status: number): boolean {
  return status === 429 || status === 403 || status === 502 || status === 503;
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
  transport: OutgoingTransport = "fetch",
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

  const proxyUrl = useProxy ? urls[proxyIndex++ % urls.length] : undefined;

  const nativeFetch = async (): Promise<Response> => {
    if (!useProxy) {
      debug("outgoing", `direct fetch ${new URL(url).hostname}`);
      return bunFetch(url, { method, redirect, signal, headers, body });
    }
    debug("outgoing", `via proxy ${proxyUrl} -> ${new URL(url).hostname}`);

    if (isSocksProxy(proxyUrl!)) {
      return fetchViaSocks(url, proxyUrl!, {
        method,
        redirect,
        signal,
        headers,
        body: body ?? undefined,
      });
    }

    return bunFetch(url, {
      method,
      redirect,
      signal,
      headers,
      body,
      proxy: proxyUrl!,
    } as RequestInit & { proxy: string });
  };

  if (transport === "curl") {
    debug("outgoing", `curl ${new URL(url).hostname}`);
    return fetchViaCurl(url, options, proxyUrl);
  }

  const first = await nativeFetch();

  if (transport === "auto" && shouldRetryWithCurl(first.status)) {
    debug("outgoing", `auto curl retry ${new URL(url).hostname}`);
    return fetchViaCurl(url, options, proxyUrl);
  }

  return first;
}
