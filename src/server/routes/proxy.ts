import { Hono } from "hono";
import { outgoingFetch } from "../utils/outgoing";
import { verifyProxyUrl } from "../utils/proxy-sign";
import { getRandomUserAgent } from "../utils/user-agents";
import { isSafeHost, type LocalImageAccess } from "../utils/ssrf";
import { asBoolean, asString } from "../utils/plugin-settings";
import { getInstanceSettings } from "../utils/server-settings";

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
  } catch {
    return "image" + (CONTENT_TYPE_EXT[contentType] ?? ".jpg");
  }
};

const PROXY_TIMEOUT_MS = 10_000;
const MAX_CONTENT_LENGTH = 25 * 1024 * 1024;
const MAX_REDIRECT_HOPS = 5;

const readBodyCapped = async (
  res: Response,
  cap: number,
): Promise<ArrayBuffer | "too-large" | "empty"> => {
  const reader = res.body?.getReader();
  if (!reader) return "empty";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        return "too-large";
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const out = new ArrayBuffer(total);
  const view = new Uint8Array(out);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
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

const _localImageAccess = async (): Promise<LocalImageAccess> => {
  const settings = await getInstanceSettings();
  return {
    enabled: asBoolean(settings.imageProxyAllowLocal),
    patterns: asString(settings.imageProxyAllowList).split("\n"),
  };
};

const followRedirects = async (
  initial: string,
  init: {
    headers: Record<string, string>;
    signal: AbortSignal;
    access: LocalImageAccess;
  },
): Promise<Response | null> => {
  let target = initial;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    try {
      const parsed = new URL(target);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      if (!(await isSafeHost(parsed.hostname, init.access))) return null;
    } catch {
      return null;
    }
    const res = await outgoingFetch(target, {
      signal: init.signal,
      headers: init.headers,
      redirect: "manual",
    });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    if (!loc) return res;
    try {
      target = new URL(loc, target).toString();
    } catch {
      return null;
    }
  }
  return null;
};

router.get("/api/proxy/image", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.body("Missing url parameter", 400);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.body("Invalid URL", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return c.body("Invalid protocol", 400);
  }

  const sig = c.req.query("sig");
  if (!sig || !verifyProxyUrl(url, sig)) {
    return c.body("Invalid or missing signature", 403);
  }
  const headers: Record<string, string> = {
    "User-Agent": getRandomUserAgent(),
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
    Referer: parsed.origin + "/",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const res = await followRedirects(url, {
      signal: controller.signal,
      headers,
      access: await _localImageAccess(),
    });
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

    const body = await readBodyCapped(res, MAX_CONTENT_LENGTH);
    if (body === "too-large") return c.body("Image too large", 413);
    if (body === "empty") return c.body("Empty upstream body", 502);

    return c.body(body, 200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${getProxyFilename(url, contentType)}"`,
    });
  } catch {
    clearTimeout(timeout);
    return c.body("Proxy failed", 502);
  }
});

const FAVICON_TIMEOUT_MS = 5_000;
const FAVICON_MAX_CONTENT_LENGTH = 512 * 1024;
const FAVICON_CONTENT_TYPES = ["image/", "text/html"];

router.get("/api/proxy/favicon", async (c) => {
  const domain = c.req.query("domain")?.trim();
  if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain)) {
    return c.body("Invalid domain", 400);
  }

  const candidates = [
    `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ];

  for (const faviconUrl of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
    try {
      const res = await outgoingFetch(faviconUrl, {
        signal: controller.signal,
        headers: { "User-Agent": getRandomUserAgent() },
        redirect: "follow",
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      if (!FAVICON_CONTENT_TYPES.some((t) => contentType.startsWith(t))) continue;
      const body = await readBodyCapped(res, FAVICON_MAX_CONTENT_LENGTH);
      if (body === "too-large" || body === "empty") continue;
      return c.body(body, 200, {
        "Content-Type": contentType || "image/x-icon",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      });
    } catch {
      clearTimeout(timeout);
    }
  }

  return c.body("Favicon not found", 404);
});

export default router;
