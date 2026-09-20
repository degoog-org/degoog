import { Database } from "bun:sqlite";
import { unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { getAdapter } from "../db/factory";
import type { ExportRow } from "../types/adapter";
import { rankFields } from "../shared/rank-fields";
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

    const insertUrl = db.prepare(`
      INSERT INTO urls (url_norm, url, source_engine, title, snippet,
        thumbnail, image_url, is_gif, duration, extras_json, first_seen, last_seen)
      VALUES ($url_norm, $url, $source_engine, $title, $snippet,
        $thumbnail, $image_url, $is_gif, $duration, $extras_json, $first_seen, $last_seen)
      ON CONFLICT(url_norm) DO NOTHING
      RETURNING id
    `);
    const insertHit = db.prepare(`
      INSERT INTO query_hits (
        query_norm, engine_type, url_id, best_position, pos_sum, hit_count,
        sources_json, filters_json, meta_json, first_seen, last_seen
      )
      VALUES (
        $query_norm, $engine_type, $url_id, $best_position, $pos_sum, $hit_count,
        $sources_json, $filters_json, $meta_json, $first_seen, $last_seen
      )
      ON CONFLICT(query_norm, engine_type, url_id) DO NOTHING
    `);
    const selectUrl = db.prepare("SELECT id FROM urls WHERE url_norm = ?");

    const tx = db.transaction((batch: ExportRow[]) => {
      for (const row of batch) {
        const inserted = insertUrl.get({
          $url_norm: row.url_norm,
          $url: row.url,
          $source_engine: row.source_engine,
          $title: row.title,
          $snippet: row.snippet,
          $thumbnail: row.thumbnail,
          $image_url: row.image_url,
          $is_gif: row.is_gif,
          $duration: row.duration,
          $extras_json: row.extras_json,
          $first_seen: row.first_seen,
          $last_seen: row.last_seen,
        }) as { id: number } | null;

        const urlId =
          inserted?.id ?? (selectUrl.get(row.url_norm) as { id: number } | null)?.id;
        if (!urlId) continue;

        const rank = rankFields(row);
        insertHit.run({
          $query_norm: row.query_norm,
          $engine_type: row.engine_type,
          $url_id: urlId,
          $best_position: rank.best_position,
          $pos_sum: rank.pos_sum,
          $hit_count: rank.hit_count,
          $sources_json: rank.sources_json,
          $filters_json: rank.filters_json,
          $meta_json: rank.meta_json,
          $first_seen: row.first_seen,
          $last_seen: row.last_seen,
        });
      }
    });

    for await (const batch of adapter.exportBatches(type, EXPORT_BATCH_SIZE)) {
      tx(batch);
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
