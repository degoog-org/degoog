import { Hono } from "hono";
import { outgoingFetch } from "../utils/net/outgoing";
import { verifyFaviconSig, verifyProxyUrl } from "../utils/net/proxy-sign";
import { readWithin } from "../utils/net/read-body";
import { localImageAccess } from "../utils/security/local-image-access";
import { isFaviconHost } from "../extensions/favicon/host";
import { resolveFaviconBytes } from "../extensions/favicon/resolve";
import { getRandomHintlessUserAgent } from "../utils/net/user-agents";
import { fetchWithSafeRedirects } from "../utils/security/safe-redirects";
import { logger } from "../utils/logger";
import { createConcurrencyGate } from "../utils/net/concurrency-gate";
import { fetchEngineRoute, isEngineRouteUrl } from "../extensions/engines/engine-routes";

const router = new Hono();

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "image/x-icon": ".ico",
};

const getProxyFilename = (originalUrl: string, contentType: string): string => {
  try {
    const pathname = new URL(originalUrl).pathname;
    const basename = pathname.split("/").filter(Boolean).pop() || "";
    if (basename && /\.\w{2,5}$/.test(basename)) return basename;
    const ext = CONTENT_TYPE_EXT[contentType] ?? ".jpg";
    return basename ? basename + ext : "image" + ext;
  } catch (err) {
    logger.debug("proxy", `invalid URL for filename ${originalUrl}`, err);
    return "image" + (CONTENT_TYPE_EXT[contentType] ?? ".jpg");
  }
};

const PROXY_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
const PROXY_TIMEOUT_MS = 10_000;
const MAX_CONTENT_LENGTH = 25 * 1024 * 1024;

const PROXY_DEADLINE_MS = 30_000;
const PROXY_MAX_ACTIVE = 256;
const PROXY_MAX_QUEUED = 2048;

export const imageProxyGate = createConcurrencyGate(PROXY_MAX_ACTIVE, PROXY_MAX_QUEUED);

export const streamBodyCapped = (
  body: ReadableStream<Uint8Array>,
  cap: number,
  idleMs: number,
  deadlineAt: number,
  onDone: () => void,
): ReadableStream<Uint8Array> => {
  const reader = body.getReader();
  let total = 0;
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    onDone();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const remaining = deadlineAt - Date.now();
        if (remaining <= 0) throw new Error("upstream too slow");
        const { done, value } = await readWithin(reader.read(), Math.min(idleMs, remaining));
        if (done) {
          controller.close();
          finish();
          return;
        }
        total += value.byteLength;
        if (total > cap) throw new Error("image too large");
        controller.enqueue(value);
      } catch (err) {
        logger.debug("proxy", "image stream stopped", err);
        await reader.cancel().catch(() => {});
        controller.error(err);
        finish();
      }
    },
    async cancel() {
      await reader.cancel().catch(() => {});
      finish();
    },
  });
};

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "image/x-icon",
];

router.get("/api/proxy/image", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.body("Missing url parameter", 400);

  const engineRoute = isEngineRouteUrl(url);
  let parsed: URL | null = null;
  if (!engineRoute) {
    try {
      parsed = new URL(url);
    } catch (err) {
      logger.debug("proxy", `invalid proxy URL ${url}`, err);
      return c.body("Invalid URL", 400);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return c.body("Invalid protocol", 400);
    }
  }

  const sig = c.req.query("sig");
  if (!sig || !verifyProxyUrl(url, sig)) {
    return c.body("Invalid or missing signature", 403);
  }
  const headers: Record<string, string> = {
    "User-Agent": getRandomHintlessUserAgent(),
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
    ...(parsed ? { Referer: parsed.origin + "/" } : {}),
  };

  const release = await imageProxyGate.acquire();
  if (!release) return c.body("Image proxy busy", 503, { "Retry-After": "5" });

  const deadlineAt = Date.now() + PROXY_DEADLINE_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  let streaming = false;

  try {
    const res = engineRoute
      ? await fetchEngineRoute(url)
      : await fetchWithSafeRedirects(
          outgoingFetch,
          url,
          { signal: controller.signal, headers },
          await localImageAccess(),
        );
    clearTimeout(timeout);

    if (!res) return c.body("Blocked redirect", 502);
    if (!res.ok) return c.body("Upstream error", 502);

    const contentType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_CONTENT_TYPES.some((t) => contentType.startsWith(t))) {
      return c.body("Not an image", 400);
    }

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_CONTENT_LENGTH) {
      return c.body("Image too large", 413);
    }

    if (!res.body) return c.body("Empty upstream body", 502);
    const body = streamBodyCapped(res.body, MAX_CONTENT_LENGTH, PROXY_TIMEOUT_MS, deadlineAt, release);
    streaming = true;

    return c.body(body, 200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": PROXY_CSP,
      "Content-Disposition": `inline; filename="${getProxyFilename(url, contentType)}"`,
    });
  } catch (err) {
    logger.warn("proxy", "image proxy fetch failed", err);
    clearTimeout(timeout);
    return c.body("Proxy failed", 502);
  } finally {
    if (!streaming) release();
  }
});

const FAVICON_MAX_ACTIVE = 64;
const FAVICON_MAX_QUEUED = 1024;

export const faviconProxyGate = createConcurrencyGate(FAVICON_MAX_ACTIVE, FAVICON_MAX_QUEUED);

router.get("/api/proxy/favicon", async (c) => {
  const domain = c.req.query("domain")?.trim() ?? "";
  if (!isFaviconHost(domain)) return c.body("Invalid domain", 400);

  const sig = c.req.query("sig");
  if (!sig || !verifyFaviconSig(domain, sig)) {
    return c.body("Invalid or missing signature", 403);
  }

  const release = await faviconProxyGate.acquire();
  if (!release) return c.body("Favicon proxy busy", 503, { "Retry-After": "5" });

  try {
    const icon = await resolveFaviconBytes(domain);
    if (!icon) return c.body("Favicon not found", 404);
    return c.body(new Uint8Array(icon.data), 200, {
      "Content-Type": icon.contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": PROXY_CSP,
    });
  } finally {
    release();
  }
});

export default router;
