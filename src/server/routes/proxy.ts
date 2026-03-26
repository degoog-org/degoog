import { Hono } from "hono";
import { getSettings, asString } from "../utils/plugin-settings";
import { outgoingFetch, isUrlAllowedForOutgoing } from "../utils/outgoing";

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

  const authId = c.req.query("auth_id");
  const headers: Record<string, string> = {
    "User-Agent": "degoog/1.0",
    Accept: "image/*",
  };

  if (authId) {
    const stored = await getSettings(authId);
    const apiKey = asString(stored["apiKey"]);
    const serverUrl = asString(stored["url"]);
    const headerName = asString(stored["headerName"]);
    if (apiKey && serverUrl && headerName && /^[A-Za-z0-9-]+$/.test(headerName)) {
      try {
        const serverHost = new URL(serverUrl).hostname;
        if (parsed.hostname === serverHost) {
          headers[headerName] = apiKey;
        }
      } catch {}
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers,
      redirect: "follow",
    });
    clearTimeout(timeout);

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
