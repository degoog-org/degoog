import { Hono } from "hono";
import { outgoingFetch } from "../../../utils/net/outgoing";
import { asBoolean, asString } from "../../../utils/settings/plugin-settings";
import { getRandomUserAgent } from "../../../utils/net/user-agents";
import { readObjectBody } from "../../../utils/hono";
import { getInstanceSettings } from "../../../utils/settings/server-settings";
import { logger } from "../../../utils/logger";
import { settingsAuth } from "../../_guards";

const router = new Hono();

const IP_CHECK_URL = "https://api.ipify.org?format=json";
const IP_CHECK_TIMEOUT_MS = 8_000;

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

  const directIp = await fetchIp(fetch);

  if (!enabled || !proxyUrls.trim()) {
    return c.json({
      enabled: false,
      directIp,
      proxyIp: null,
      match: null,
    });
  }

  const overrideFetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
    outgoingFetch(
      String(_url),
      {
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        signal: init?.signal ?? undefined,
      },
      "fetch",
      {
        proxyOverrideEnabled: true,
        proxyOverrideUrls: proxyUrls,
      },
    )) as typeof fetch;
  const proxyIp = await fetchIp(overrideFetch);

  return c.json({
    enabled: true,
    directIp,
    proxyIp,
    match: directIp !== null && proxyIp !== null && directIp === proxyIp,
  });
});

export default router;
