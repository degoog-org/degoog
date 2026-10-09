import { Hono } from "hono";
import { isUrlAllowedForOutgoing, proxyEnv } from "../../../utils/net/outgoing";
import { fetchViaHttpProxy } from "../../../utils/net/http-proxy-fetch";
import { fetchViaSocks, isSocksProxy } from "../../../utils/net/socks-fetch";
import { createConcurrencyGate } from "../../../utils/net/concurrency-gate";
import { asBoolean, asString } from "../../../utils/settings/plugin-settings";
import { getRandomUserAgent } from "../../../utils/net/user-agents";
import { readObjectBody } from "../../../utils/hono";
import { getInstanceSettings } from "../../../utils/settings/server-settings";
import { logger } from "../../../utils/logger";
import { settingsAuth } from "../../_guards";

const router = new Hono();

const IP_CHECK_URL = "https://api.ipify.org?format=json";
const IP_CHECK_TIMEOUT_MS = 8_000;
const PING_MAX_URLS = 64;
const PING_MAX_ACTIVE = 8;

const _pingGate = createConcurrencyGate(PING_MAX_ACTIVE, PING_MAX_URLS * 2);

const IP_CHECK_REFUSED = "IP check host not allowed for outgoing requests";

export interface ProxyPing {
  ok: boolean;
  ms: number | null;
  ip: string | null;
}

const UNREACHABLE: ProxyPing = { ok: false, ms: null, ip: null };

const _lines = (raw: string): string[] =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const fetchIp = async (useFn: typeof fetch): Promise<string | null> => {
  try {
    const res = await useFn(IP_CHECK_URL, {
      signal: AbortSignal.timeout(IP_CHECK_TIMEOUT_MS),
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept: "application/json,text/plain,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    return data.ip ?? null;
  } catch (err) {
    logger.debug("settings", "public IP lookup failed", err);
    return null;
  }
};

const _viaProxy = (proxyUrl: string): typeof fetch =>
  ((url: RequestInfo | URL, init?: RequestInit) => {
    const options = {
      method: init?.method,
      headers: init?.headers as Record<string, string> | undefined,
      signal: init?.signal ?? undefined,
    };
    return isSocksProxy(proxyUrl)
      ? fetchViaSocks(String(url), proxyUrl, options, IP_CHECK_TIMEOUT_MS)
      : fetchViaHttpProxy(String(url), proxyUrl, options, IP_CHECK_TIMEOUT_MS);
  }) as typeof fetch;

const _pingOne = async (raw: string): Promise<ProxyPing> => {
  const proxyUrl = proxyEnv(raw.trim());
  if (!proxyUrl) return UNREACHABLE;
  const release = await _pingGate.acquire();
  if (!release) return UNREACHABLE;
  try {
    const started = performance.now();
    const ip = await fetchIp(_viaProxy(proxyUrl));
    return ip ? { ok: true, ms: Math.round(performance.now() - started), ip } : UNREACHABLE;
  } finally {
    release();
  }
};

const _pingAll = (urls: string[]): Promise<ProxyPing[]> =>
  Promise.all(urls.slice(0, PING_MAX_URLS).map(_pingOne));

router.post("/api/settings/proxy-ping", settingsAuth("POST /api/settings/proxy-ping"), async (c) => {
  const body = await readObjectBody<{ urls?: unknown }>(c);
  const urls = Array.isArray(body?.urls)
    ? body.urls.filter((u): u is string => typeof u === "string")
    : [];
  if (!isUrlAllowedForOutgoing(IP_CHECK_URL)) return c.json({ error: IP_CHECK_REFUSED }, 409);
  return c.json({ results: await _pingAll(urls) });
});

router.post("/api/settings/proxy-test", settingsAuth("POST /api/settings/proxy-test"), async (c) => {
  const body = await readObjectBody<{ proxyEnabled?: string; proxyUrls?: string }>(c);

  let enabled: boolean;
  let proxyUrls: string;

  if (body) {
    enabled = asBoolean(body.proxyEnabled);
    proxyUrls = asString(body.proxyUrls);
  } else {
    const settings = await getInstanceSettings();
    enabled = asBoolean(settings.proxyEnabled);
    proxyUrls = asString(settings.proxyUrls);
  }

  const urls = enabled ? _lines(proxyUrls) : [];
  if (urls.length > 0 && !isUrlAllowedForOutgoing(IP_CHECK_URL)) {
    return c.json({ error: IP_CHECK_REFUSED }, 409);
  }
  const [directIp, proxies] = await Promise.all([fetchIp(fetch), _pingAll(urls)]);

  return c.json({ enabled: urls.length > 0, directIp, proxies });
});

export default router;
