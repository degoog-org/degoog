import { Hono } from "hono";
import { outgoingFetch, isUrlAllowedForOutgoing } from "../utils/outgoing";
import { verifyProxyUrl } from "../utils/proxy-sign";
import { getRandomUserAgent } from "../utils/user-agents";

const router = new Hono();

const PROXY_FETCH_TIMEOUT_MS = 15_000;

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
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
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
  const allowed = (sig && verifyProxyUrl(url, sig)) || isUrlAllowedForOutgoing(url);
  if (!allowed) {
    return c.body("URL not allowed for outgoing fetch", 403);
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
    const res = await outgoingFetch(url, {
      signal: controller.signal,
      headers,
      redirect: "manual",
    });
    clearTimeout(timeout);

    if (res.status >= 300 && res.status < 400) return c.body("Upstream error", 502);
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

    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_CONTENT_LENGTH) {
      return c.body("Image too large", 413);
    }

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
      const body = await res.arrayBuffer();
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

router.post("/api/proxy/fetch", async (c) => {
  let body: { url?: string; headers?: Record<string, string> };
  try {
    body = await c.req.json<{
      url?: string;
      headers?: Record<string, string>;
    }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const url = body?.url?.trim();
  if (!url) return c.json({ error: "Missing url" }, 400);
  if (!isUrlAllowedForOutgoing(url)) {
    return c.json({ error: "URL not allowed for outgoing fetch" }, 403);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_FETCH_TIMEOUT_MS);
  try {
    const res = await outgoingFetch(url, {
      headers: body.headers ?? {},
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const resBody = await res.arrayBuffer();
    const contentType =
      res.headers.get("content-type") ?? "application/octet-stream";
    return new Response(resBody, {
      status: res.status,
      headers: { "Content-Type": contentType },
    });
  } catch {
    clearTimeout(timeout);
    return c.json({ error: "Proxy fetch failed" }, 502);
  }
});

export default router;
