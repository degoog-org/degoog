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
import { isSocksProxy, fetchViaSocks } from "./socks-fetch";
import { fetchViaHttpProxy } from "./http-proxy-fetch";
import { resolveTransport } from "../extensions/transports/registry";
import { debug } from "./logger";
import type {
  Transport,
  TransportFetchOptions,
  TransportContext,
  ProxyAwareFetch,
} from "../extensions/transports/types";

export type { TransportFetchOptions as OutgoingFetchOptions };

const DEGOOG_SETTINGS_ID = "degoog-settings";

export type OutgoingTransport = string;

export function parseOutgoingTransport(raw: string | undefined): string {
  return raw?.trim() || "fetch";
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

function _buildProxyFetch(
  proxyUrl?: string,
  timeoutMs?: number,
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

    if (isSocksProxy(proxyUrl)) {
      return fetchViaSocks(
        url,
        proxyUrl,
        {
          method,
          redirect,
          signal,
          headers,
          body,
        },
        timeoutMs,
      );
    }

    return fetchViaHttpProxy(
      url,
      proxyUrl,
      {
        method,
        redirect,
        signal,
        headers,
        body,
      },
      timeoutMs,
    );
  };
}

async function buildTransportContext(
  transportName: string,
): Promise<{ transport: Transport; context: TransportContext }> {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  const enabled = settings.proxyEnabled === "true";
  const proxyUrlsRaw = settings.proxyUrls;
  const urls = parseProxyUrls(
    typeof proxyUrlsRaw === "string" ? proxyUrlsRaw : "",
  );
  const useProxy = enabled && urls.length > 0;
  const proxyUrl = useProxy ? urls[proxyIndex++ % urls.length] : undefined;
  const transport = resolveTransport(transportName);
  return {
    transport,
    context: {
      proxyUrl,
      fetch: _buildProxyFetch(proxyUrl, transport.timeoutMs),
    },
  };
}

export async function outgoingFetch(
  url: string,
  options: TransportFetchOptions = {},
  transportName: string = "fetch",
): Promise<Response> {
  const { transport, context } = await buildTransportContext(transportName);
  const host = new URL(url).hostname;
  if (context.proxyUrl) {
    debug("outgoing", `${transport.name} via ${context.proxyUrl} -> ${host}`);
  } else {
    debug("outgoing", `${transport.name} -> ${host}`);
  }
  return transport.fetch(url, options, context);
}
