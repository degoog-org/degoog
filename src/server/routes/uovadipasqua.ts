import { Hono } from "hono";
import {
  getUovadipasquaAssetPath,
  listUovadipasquaClientStorageBindings,
  matchUovadipasqua,
  findUovadipasquaRoute,
} from "../extensions/uovadipasqua/registry";
import { logger } from "../utils/logger";

const router = new Hono();

router.get("/api/uovadipasqua/client-storage", (c) => {
  const bindings = listUovadipasquaClientStorageBindings();
  return c.json({ bindings });
});

router.get("/api/uovadipasqua/match", (c) => {
  const query = c.req.query("q") ?? "";
  const matches = matchUovadipasqua(query);
  return c.json({ matches });
});

const CONTENT_TYPES: Record<string, string> = {
  js: "application/javascript",
  css: "text/css",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

router.all("/api/uovadipasqua/:id/*", async (c) => {
  const id = c.req.param("id");
  const prefix = `/api/uovadipasqua/${id}`;
  const suffix = c.req.path.startsWith(prefix)
    ? c.req.path.slice(prefix.length) || "/"
    : "/";
  const method = c.req.method.toLowerCase();
  const route = findUovadipasquaRoute(id, method, suffix);
  if (!route) return c.notFound();
  try {
    const res = await route.handler(c.req.raw);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (err) {
    logger.error(`[uovadipasqua] route error [${id}] ${method} ${suffix}:`, err);
    return c.json({ error: "Route failed" }, 500);
  }
});

router.get("/uovadipasqua/:id/:asset", async (c) => {
  const id = c.req.param("id");
  const asset = c.req.param("asset");
  const filePath = getUovadipasquaAssetPath(id, asset);
  if (!filePath) return c.notFound();
  const file = Bun.file(filePath);
  if (!(await file.exists())) return c.notFound();
  const ext = asset.split(".").pop() ?? "";
  c.header("Content-Type", CONTENT_TYPES[ext] ?? "application/octet-stream");
  c.header("Cache-Control", "no-cache");
  return c.body(await file.arrayBuffer());
});

export default router;
