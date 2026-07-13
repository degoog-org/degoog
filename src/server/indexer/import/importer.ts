import { Database } from "bun:sqlite";
import { writeFileSync, unlinkSync, readFileSync, openSync, readSync, closeSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import type { ExportRow } from "../types/adapter";
import { getAdapter } from "../db/factory";
import { parseSqlDump } from "./sql-parser";
import { logger } from "../../utils/logger";

const BATCH_SIZE = 500;
const SQLITE_MAGIC = "SQLite format 3\0";
const IMPORT_READ_ERROR = "Invalid index import file";
const OPTIONAL_HIT_COLUMNS = [
  "best_position",
  "pos_sum",
  "hit_count",
  "sources_json",
  "filters_json",
  "meta_json",
];

const buildSelectSql = (db: Database): string => {
  const cols = new Set(
    (db.prepare("PRAGMA table_info(query_hits)").all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  const optional = OPTIONAL_HIT_COLUMNS.filter((c) => cols.has(c))
    .map((c) => `h.${c}`)
    .join(", ");
  return `
    SELECT h.query_norm, h.engine_type, u.url, u.url_norm, u.source_engine,
           u.title, u.snippet, u.thumbnail, u.image_url, u.is_gif, u.duration,
           u.extras_json, h.first_seen, h.last_seen, NULL AS source_instance${
             optional ? `, ${optional}` : ""
           }
    FROM query_hits h
    JOIN urls u ON u.id = h.url_id
  `;
};

export interface ImportResult {
  urls: number;
  hits: number;
}

const isSqliteFile = (path: string): boolean => {
  let fd: number | null = null;
  try {
    const header = Buffer.alloc(SQLITE_MAGIC.length);
    fd = openSync(path, "r");
    const read = readSync(fd, header, 0, SQLITE_MAGIC.length, 0);
    return read === SQLITE_MAGIC.length && header.toString("binary") === SQLITE_MAGIC;
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
};

const isJsonString = (value: unknown): value is string | null => {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

const validUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const validNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const validateImportRow = (row: unknown): ExportRow | null => {
  if (!row || typeof row !== "object") return null;
  const r = row as Partial<ExportRow>;
  if (
    typeof r.query_norm !== "string" ||
    r.query_norm.length === 0 ||
    typeof r.engine_type !== "string" ||
    r.engine_type.length === 0 ||
    !validUrl(r.url) ||
    typeof r.url_norm !== "string" ||
    r.url_norm.length === 0 ||
    typeof r.source_engine !== "string" ||
    r.source_engine.length === 0 ||
    typeof r.title !== "string" ||
    typeof r.snippet !== "string" ||
    !validNumber(r.first_seen) ||
    !validNumber(r.last_seen) ||
    !isJsonString(r.extras_json) ||
    !isJsonString(r.sources_json) ||
    !isJsonString(r.filters_json) ||
    !isJsonString(r.meta_json)
  ) {
    return null;
  }
  return {
    query_norm: r.query_norm,
    engine_type: r.engine_type,
    url: r.url,
    url_norm: r.url_norm,
    source_engine: r.source_engine,
    title: r.title,
    snippet: r.snippet,
    thumbnail: typeof r.thumbnail === "string" ? r.thumbnail : null,
    image_url: typeof r.image_url === "string" ? r.image_url : null,
    is_gif: validNumber(r.is_gif) ? r.is_gif : null,
    duration: typeof r.duration === "string" ? r.duration : null,
    extras_json: r.extras_json ?? null,
    first_seen: r.first_seen,
    last_seen: r.last_seen,
    source_instance: typeof r.source_instance === "string" ? r.source_instance : null,
    best_position: validNumber(r.best_position) ? r.best_position : null,
    pos_sum: validNumber(r.pos_sum) ? r.pos_sum : null,
    hit_count: validNumber(r.hit_count) ? r.hit_count : null,
    sources_json: r.sources_json ?? null,
    filters_json: r.filters_json ?? null,
    meta_json: r.meta_json ?? null,
  };
};

function* readSqliteRows(path: string, type: string): Generator<ExportRow> {
  const sourceDb = new Database(path, { readonly: true });
  try {
    const sql = `${buildSelectSql(sourceDb)} LIMIT ? OFFSET ?`;
    const stmt = sourceDb.prepare(sql);
    let count = 0;
    for (let offset = 0; ; offset += BATCH_SIZE) {
      const rows = stmt.all(BATCH_SIZE, offset) as unknown[];
      if (rows.length === 0) break;
      for (const row of rows) {
        const valid = validateImportRow(row);
        if (valid) {
          count++;
          yield valid;
        }
      }
    }
    logger.info("indexer", `importer: read ${count} sqlite rows for type=${type}`);
  } catch (err) {
    logger.warn("indexer", "importer: failed to read rows from uploaded db", err);
    throw new Error(IMPORT_READ_ERROR);
  } finally {
    sourceDb.close();
  }
}

function* readSqlRows(path: string, type: string): Generator<ExportRow> {
  try {
    let count = 0;
    for (const row of parseSqlDump(readFileSync(path, "utf8")) as unknown[]) {
      const valid = validateImportRow(row);
      if (valid) {
        count++;
        yield valid;
      }
    }
    logger.info("indexer", `importer: read ${count} sql rows for type=${type}`);
  } catch (err) {
    logger.warn("indexer", "importer: failed to read rows from uploaded sql", err);
    throw new Error(IMPORT_READ_ERROR);
  }
}

const flushRows = async (rows: Iterable<ExportRow>, type: string): Promise<ImportResult> => {
  const adapter = getAdapter();
  let urls = 0;
  let hits = 0;
  let batch: ExportRow[] = [];
  const flushBatch = async (): Promise<void> => {
    if (batch.length === 0) return;
    const result = await adapter.importRows(type, batch);
    urls += result.urls;
    hits += result.hits;
    batch = [];
  };

  for (const row of rows) {
    batch.push(row);
    if (batch.length >= BATCH_SIZE) await flushBatch();
  }
  await flushBatch();

  logger.info("indexer", `import complete type=${type} urls=${urls} hits=${hits}`);
  return { urls, hits };
};

export const importFromFile = async (
  path: string,
  type: string,
): Promise<ImportResult> => {
  const rows = isSqliteFile(path)
    ? readSqliteRows(path, type)
    : readSqlRows(path, type);
  return flushRows(rows, type);
};

export const importFromBuffer = async (
  fileBuffer: ArrayBuffer,
  type: string,
): Promise<ImportResult> => {
  const tmpPath = join(tmpdir(), `degoog-import-${randomBytes(8).toString("hex")}.db`);
  try {
    writeFileSync(tmpPath, Buffer.from(fileBuffer));
    return await importFromFile(tmpPath, type);
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup
    }
  }
};
