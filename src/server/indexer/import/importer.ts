import { Database } from "bun:sqlite";
import {
  writeFileSync,
  unlinkSync,
  readFileSync,
  openSync,
  readSync,
  closeSync,
  statSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import type { ExportRow } from "../types/adapter";
import { getAdapter } from "../db/factory";
import { parseSqlDump } from "./sql-parser";
import { logger } from "../../utils/logger";

const BATCH_SIZE = 500;
const MAX_SQL_DUMP_BYTES = 256 * 1024 * 1024;
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

interface BatchWriter {
  add: (row: ExportRow) => Promise<void>;
  finish: () => Promise<ImportResult>;
}

const makeBatchWriter = (type: string): BatchWriter => {
  const adapter = getAdapter();
  let pending: ExportRow[] = [];
  let urls = 0;
  let hits = 0;

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    const result = await adapter.importRows(type, pending);
    urls += result.urls;
    hits += result.hits;
    pending = [];
  };

  return {
    add: async (row) => {
      pending.push(row);
      if (pending.length >= BATCH_SIZE) await flush();
    },
    finish: async () => {
      await flush();
      return { urls, hits };
    },
  };
};

const isSqliteFile = (path: string): boolean => {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const header = Buffer.alloc(SQLITE_MAGIC.length);
    const read = readSync(fd, header, 0, SQLITE_MAGIC.length, 0);
    return read === SQLITE_MAGIC.length && header.toString("binary") === SQLITE_MAGIC;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch (err) {
        logger.warn("indexer", "importer: failed to close file handle", err);
      }
    }
  }
};

const importSqlite = async (path: string, type: string): Promise<ImportResult> => {
  const sourceDb = new Database(path, { readonly: true });
  const batch = makeBatchWriter(type);
  let read = 0;
  try {
    for (const row of sourceDb
      .prepare(buildSelectSql(sourceDb))
      .iterate() as Iterable<ExportRow>) {
      await batch.add(row);
      read++;
    }
  } catch (err) {
    logger.warn("indexer", "importer: failed to read rows from uploaded db", err);
    throw new Error("Failed to read import file");
  } finally {
    sourceDb.close();
  }
  const result = await batch.finish();
  logger.info(
    "indexer",
    `import complete type=${type} rows=${read} urls=${result.urls} hits=${result.hits}`,
  );
  return result;
};

const readSqlRows = (path: string, type: string): ExportRow[] => {
  const size = statSync(path).size;
  if (size > MAX_SQL_DUMP_BYTES) {
    logger.warn("indexer", `importer: sql dump rejected, ${size} bytes is too large`);
    throw new Error(
      `SQL dump is larger than ${Math.round(MAX_SQL_DUMP_BYTES / (1024 * 1024))} MB`,
    );
  }
  try {
    const rows = parseSqlDump(readFileSync(path, "utf8"));
    logger.info("indexer", `importer: read ${rows.length} sql rows for type=${type}`);
    return rows;
  } catch (err) {
    logger.warn("indexer", "importer: failed to read rows from uploaded sql", err);
    throw new Error("Failed to read import file");
  }
};

const flushRows = async (rows: ExportRow[], type: string): Promise<ImportResult> => {
  const batch = makeBatchWriter(type);
  for (const row of rows) await batch.add(row);
  const result = await batch.finish();
  logger.info(
    "indexer",
    `import complete type=${type} urls=${result.urls} hits=${result.hits}`,
  );
  return result;
};

export const importFromFile = async (
  path: string,
  type: string,
): Promise<ImportResult> => {
  if (isSqliteFile(path)) return importSqlite(path, type);
  return flushRows(readSqlRows(path, type), type);
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
