import { Database } from "bun:sqlite";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import type { ExportRow } from "../types/adapter";
import { getAdapter } from "../db/factory";
import { parseSqlDump } from "./sql-parser";
import { logger } from "../../utils/logger";

const BATCH_SIZE = 500;
const SQLITE_MAGIC = "SQLite format 3\0";
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
  try {
    const header = Buffer.alloc(SQLITE_MAGIC.length);
    const fd = readFileSync(path);
    fd.copy(header, 0, 0, SQLITE_MAGIC.length);
    return header.toString("binary") === SQLITE_MAGIC;
  } catch {
    return false;
  }
};

const readSqliteRows = (path: string, type: string): ExportRow[] => {
  const sourceDb = new Database(path, { readonly: true });
  try {
    const rows = sourceDb.prepare(buildSelectSql(sourceDb)).all() as ExportRow[];
    logger.info("indexer", `importer: read ${rows.length} sqlite rows for type=${type}`);
    return rows;
  } catch (err) {
    logger.warn("indexer", "importer: failed to read rows from uploaded db", err);
    return [];
  } finally {
    sourceDb.close();
  }
};

const readSqlRows = (path: string, type: string): ExportRow[] => {
  try {
    const rows = parseSqlDump(readFileSync(path, "utf8"));
    logger.info("indexer", `importer: read ${rows.length} sql rows for type=${type}`);
    return rows;
  } catch (err) {
    logger.warn("indexer", "importer: failed to read rows from uploaded sql", err);
    return [];
  }
};

const flushRows = async (rows: ExportRow[], type: string): Promise<ImportResult> => {
  if (rows.length === 0) return { urls: 0, hits: 0 };

  const adapter = getAdapter();
  let urls = 0;
  let hits = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const result = await adapter.importRows(type, rows.slice(i, i + BATCH_SIZE));
    urls += result.urls;
    hits += result.hits;
  }

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
