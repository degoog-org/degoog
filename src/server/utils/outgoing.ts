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
import { resolveTransport } from "../extensions/transports/registry";
import type {
  ProxyAwareFetch,
  Transport,
  TransportContext,
  TransportFetchOptions,
} from "../types";
import { fetchViaHttpProxy } from "./http-proxy-fetch";
import { logger } from "./logger";
import { asBoolean, getSettings } from "./plugin-settings";
import { fetchViaSocks, isSocksProxy } from "./socks-fetch";

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

function parseProxyUrlsList(rawList: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawList) {
    if (typeof raw !== "string") continue;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
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
  opts?: {
    proxyOverrideEnabled?: boolean;
    proxyOverrideUrls?: string | string[];
  },
): Promise<{ transport: Transport; context: TransportContext }> {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  const proxyOverrideEnabled = opts?.proxyOverrideEnabled === true;
  const proxyOverrideRaw = opts?.proxyOverrideUrls;

  const globalEnabled = asBoolean(settings.proxyEnabled);
  const globalProxyUrlsRaw = settings.proxyUrls;
  const globalUrls = parseProxyUrls(
    typeof globalProxyUrlsRaw === "string" ? globalProxyUrlsRaw : "",
  );

  const overrideUrls = Array.isArray(proxyOverrideRaw)
    ? parseProxyUrlsList(proxyOverrideRaw)
    : parseProxyUrls(typeof proxyOverrideRaw === "string" ? proxyOverrideRaw : "");

  const useProxy = proxyOverrideEnabled
    ? overrideUrls.length > 0
    : globalEnabled && globalUrls.length > 0;

  const urls = proxyOverrideEnabled ? overrideUrls : globalUrls;
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
  ctx?: {
    proxyOverrideEnabled?: boolean;
    proxyOverrideUrls?: string | string[];
  },
): Promise<Response> {
  const { transport, context } = await buildTransportContext(transportName, ctx);
  const host = new URL(url).hostname;
  if (context.proxyUrl) {
    logger.debug(
      "outgoing",
      `${transport.name} via ${context.proxyUrl} -> ${host}`,
    );
  } else {
    logger.debug("outgoing", `${transport.name} -> ${host}`);
  }
  return transport.fetch(url, options, context);
}
