import { Database } from "bun:sqlite";
import { unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { getAdapter } from "../db/factory";
import { createRowImporter } from "../adapters/sqlite/import-rows";
import { EXPORT_SCHEMA_DDL } from "./schema";
import { logger } from "../../utils/logger";
import { indexerTmpDir } from "../../utils/paths";

export const EXPORT_BATCH_SIZE = 1000;

export const buildSqliteExportFile = async (type: string): Promise<string> => {
  const adapter = getAdapter();

  const dir = indexerTmpDir();
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `degoog-export-${randomBytes(8).toString("hex")}.db`);

  const db = new Database(tmpPath, { create: true });
  try {
    db.exec("PRAGMA journal_mode = WAL");
    for (const sql of EXPORT_SCHEMA_DDL) db.exec(sql);

    const importRows = createRowImporter(db);

    for await (const batch of adapter.exportBatches(type, EXPORT_BATCH_SIZE)) {
      importRows(batch);
    }
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (err) {
    logger.error("indexer", `export-builder failed for type=${type}`, err);
    try {
      unlinkSync(tmpPath);
    } catch {
      // Not leaving a log or it'll spam.
    }
    throw err;
  } finally {
    db.close();
    _discard(`${tmpPath}-wal`);
    _discard(`${tmpPath}-shm`);
  }

  return tmpPath;
};

const _discard = (path: string): void => {
  try {
    unlinkSync(path);
  } catch (err) {
    logger.debug("indexer", `could not remove the export temp file ${path}`, err);
  }
};

export interface StreamOpts {
  size: number;
  removeAfter: boolean;
  onRead?: () => void;
  onEnd?: () => void;
}

export const exportStream = (
  path: string,
  opts: StreamOpts,
): ReadableStream<Uint8Array> => {
  const source = Bun.file(path).slice(0, opts.size).stream();
  if (!opts.removeAfter && !opts.onEnd && !opts.onRead) return source;

  const reader = source.getReader();

  let ended = false;
  const end = (): void => {
    if (ended) return;
    ended = true;
    if (opts.removeAfter) _discard(path);
    opts.onEnd?.();
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          end();
          return;
        }
        opts.onRead?.();
        controller.enqueue(value);
      } catch (err) {
        logger.warn("indexer", `export stream failed for ${path}`, err);
        end();
        throw err;
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        end();
      }
    },
  });
};
