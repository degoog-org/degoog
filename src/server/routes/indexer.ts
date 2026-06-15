import { Hono } from "hono";
import { readFile } from "fs/promises";
import {
  clearAll,
  countHits,
  deleteHits,
  getStats,
  listHits,
  sampleRows,
  type DeleteItem,
} from "../indexer/store";
import { checkpointType, discoverTypes, isPostgresMode } from "../indexer/db";
import { clearTypeCache } from "../extensions/engines/registry";
import { importFromBuffer } from "../indexer/import/importer";
import { buildSqliteExport } from "../indexer/export/builder";
import { indexerDbForType } from "../utils/paths";
import { getInstanceSettings } from "../utils/server-settings";
import { asBoolean } from "../utils/plugin-settings";
import { guardSettingsRoute } from "./settings-auth";
import { _applyRateLimit } from "../utils/search";
import { getClientIp } from "../utils/request";
import { logger } from "../utils/logger";

const router = new Hono();

const EXPORT_COOLDOWN_MS = 60_000;
const MAX_ROWS_LIMIT = 100;
const MAX_IMPORT_BYTES = 500 * 1024 * 1024;

const _exportCooldown = new Map<string, number>();

const gateMaster = async (): Promise<boolean> => {
  const settings = await getInstanceSettings();
  return asBoolean(settings.degoogIndexerEnabled);
};

const gatePublic = async (): Promise<boolean> => {
  const settings = await getInstanceSettings();
  return (
    asBoolean(settings.degoogIndexerEnabled) &&
    asBoolean(settings.degoogIndexerPublicExport)
  );
};

const clientKey = (c: Parameters<typeof getClientIp>[0]): string =>
  c.req.header("x-settings-token") ?? getClientIp(c) ?? "unknown";

router.get("/api/indexer/stats", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  if (!(await gateMaster())) return c.json({ error: "Indexer is disabled" }, 404);

  if (!(await gatePublic())) {
    const denied = await guardSettingsRoute(c, "GET /api/indexer/stats");
    if (denied) return denied;
  }

  const stats = await getStats();
  return c.json({ ...stats, totalResults: stats.totalHits });
});

router.get("/api/indexer/public-info", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  const available = await gatePublic();
  if (!available) return c.json({ available: false });

  return c.json({ available: true, types: discoverTypes() });
});

router.get("/api/indexer/types", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  if (!(await gateMaster())) return c.json({ error: "Indexer is disabled" }, 404);

  if (!(await gatePublic())) {
    const denied = await guardSettingsRoute(c, "GET /api/indexer/types");
    if (denied) return denied;
  }

  return c.json({ types: discoverTypes() });
});

router.get("/api/indexer/sample", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  if (!(await gateMaster())) return c.json({ error: "Indexer is disabled" }, 404);

  if (!(await gatePublic())) {
    const denied = await guardSettingsRoute(c, "GET /api/indexer/sample");
    if (denied) return denied;
  }

  const type = c.req.query("type")?.trim();
  if (!type) return c.json({ error: "type is required" }, 400);

  const limit = Math.max(
    1,
    Math.min(20, parseInt(c.req.query("limit") ?? "5", 10) || 5),
  );
  return c.json({ rows: await sampleRows(type, limit) });
});

router.get("/api/indexer/rows", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  if (!(await gateMaster())) return c.json({ error: "Indexer is disabled" }, 404);

  const denied = await guardSettingsRoute(c, "GET /api/indexer/rows");
  if (denied) return denied;

  const q = c.req.query("q")?.trim() || undefined;
  const type = c.req.query("type")?.trim() || undefined;
  const limit = Math.max(
    1,
    Math.min(MAX_ROWS_LIMIT, parseInt(c.req.query("limit") ?? "20", 10) || 20),
  );
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const offset = (page - 1) * limit;

  const total = await countHits(q, type);
  const rows = await listHits({ q, type, limit, offset });
  return c.json({ rows, total, page, limit });
});

router.post("/api/indexer/rows/delete", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  if (!(await gateMaster())) return c.json({ error: "Indexer is disabled" }, 404);

  const denied = await guardSettingsRoute(c, "POST /api/indexer/rows/delete");
  if (denied) return denied;

  let body: { items?: unknown };
  try {
    body = await c.req.json<{ items?: unknown }>();
  } catch (err) {
    logger.debug("indexer", "invalid JSON body on delete", err);
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!Array.isArray(body.items)) return c.json({ error: "items must be an array" }, 400);

  const items: DeleteItem[] = body.items.filter(
    (it): it is DeleteItem =>
      it !== null &&
      typeof it === "object" &&
      typeof (it as DeleteItem).id === "number" &&
      Number.isInteger((it as DeleteItem).id) &&
      typeof (it as DeleteItem).engine_type === "string",
  );

  if (items.length === 0) return c.json({ error: "No valid items" }, 400);

  try {
    const deleted = await deleteHits(items);
    return c.json({ ok: true, deleted });
  } catch (err) {
    logger.error("indexer", "rows delete failed", err);
    return c.json({ error: "Delete failed" }, 500);
  }
});

router.get("/api/indexer/export", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  if (!(await gateMaster())) return c.json({ error: "Indexer is disabled" }, 404);

  if (!(await gatePublic())) {
    const denied = await guardSettingsRoute(c, "GET /api/indexer/export");
    if (denied) return denied;
  }

  const type = c.req.query("type")?.trim();
  if (!type) return c.json({ error: "type is required" }, 400);

  const available = discoverTypes();
  if (!available.includes(type)) return c.json({ error: "Unknown type" }, 404);

  const key = `${clientKey(c)}:${type}`;
  const now = Date.now();
  const last = _exportCooldown.get(key) ?? 0;
  if (now - last < EXPORT_COOLDOWN_MS) {
    const retryIn = Math.ceil((EXPORT_COOLDOWN_MS - (now - last)) / 1000);
    return c.json({ error: `Cooldown active. Retry in ${retryIn}s` }, 429);
  }

  try {
    let buf: Buffer;
    if (isPostgresMode()) {
      buf = await buildSqliteExport(type);
    } else {
      checkpointType(type);
      buf = await readFile(indexerDbForType(type));
    }
    _exportCooldown.set(key, now);
    // @ts-expect-error - Buffer is not assignable to BodyInit
    return new Response(buf, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="degoog-index-${type}.db"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("indexer", `export failed for type=${type}`, err);
    return c.json({ error: "Export failed" }, 500);
  }
});

router.post("/api/indexer/import", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  if (!(await gateMaster())) return c.json({ error: "Indexer is disabled" }, 404);

  const denied = await guardSettingsRoute(c, "POST /api/indexer/import");
  if (denied) return denied;

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch (err) {
    logger.debug("indexer", "invalid form data on import", err);
    return c.json({ error: "Invalid form data" }, 400);
  }

  const type = (formData.get("type") as string | null)?.trim();
  if (!type) return c.json({ error: "type is required" }, 400);

  const file = formData.get("file") as File | null;
  if (!file) return c.json({ error: "file is required" }, 400);

  if (file.size > MAX_IMPORT_BYTES) {
    return c.json({ error: "File too large (max 500MB)" }, 413);
  }

  try {
    const buffer = await file.arrayBuffer();
    const result = await importFromBuffer(buffer, type);
    clearTypeCache();
    return c.json({ ok: true, type, ...result });
  } catch (err) {
    logger.error("indexer", `import failed for type=${type}`, err);
    return c.json({ error: "Import failed" }, 500);
  }
});

router.post("/api/indexer/clear", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;

  if (!(await gateMaster())) return c.json({ error: "Indexer is disabled" }, 404);

  const denied = await guardSettingsRoute(c, "POST /api/indexer/clear");
  if (denied) return denied;

  let body: { confirm?: boolean };
  try {
    body = await c.req.json<{ confirm?: boolean }>();
  } catch (err) {
    logger.debug("indexer", "invalid JSON body on clear", err);
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (body.confirm !== true) return c.json({ error: "Confirmation required" }, 400);

  try {
    await clearAll();
    return c.json({ ok: true });
  } catch (err) {
    logger.error("indexer", "clear failed", err);
    return c.json({ error: "Clear failed" }, 500);
  }
});

export default router;
