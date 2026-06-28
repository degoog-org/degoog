import type postgres from "postgres";
import type { IndexerConfig } from "../../types/config";

const BATCH_SIZE = 1000;

export const runPgPrune = async (
  sql: ReturnType<typeof postgres>,
  schema: string,
  cfg: IndexerConfig,
): Promise<void> => {
  const countHits = async (): Promise<number> => {
    const [row] = await sql<{ c: string }[]>`
      SELECT COUNT(*)::bigint AS c
      FROM ${sql(schema)}.query_hits
    `;
    return Number(row?.c ?? 0);
  };

  const countUrls = async (): Promise<number> => {
    const [row] = await sql<{ c: string }[]>`
      SELECT COUNT(*)::bigint AS c
      FROM ${sql(schema)}.urls
    `;
    return Number(row?.c ?? 0);
  };

  const deleteOldHitsBatch = async (cutoff: number): Promise<number> => {
    return await sql.begin(async (tx) => {
      const deletedHits = await tx<{ url_id: number }[]>`
        DELETE FROM ${tx(schema)}.query_hits
        WHERE id IN (
          SELECT id
          FROM ${tx(schema)}.query_hits
          WHERE last_seen < ${cutoff}
          ORDER BY last_seen ASC, id ASC
          LIMIT ${BATCH_SIZE}
        )
        RETURNING url_id
      `;

      const urlIds = [...new Set(deletedHits.map((row) => row.url_id))];

      if (urlIds.length > 0) {
        await tx`
          DELETE FROM ${tx(schema)}.urls u
          WHERE u.id = ANY(${urlIds})
            AND NOT EXISTS (
              SELECT 1
              FROM ${tx(schema)}.query_hits h
              WHERE h.url_id = u.id
            )
        `;
      }

      return deletedHits.length;
    });
  };

  const deleteOldHitsBatchByCount = async (limit: number): Promise<number> => {
    const [row] = await sql.begin(async (tx) => {
      const rows = await tx<{ hits_deleted: number }[]>`
        WITH doomed AS (
          SELECT id, url_id
          FROM ${tx(schema)}.query_hits
          ORDER BY last_seen ASC, id ASC
          LIMIT ${limit}
        ),
        deleted_hits AS (
          DELETE FROM ${tx(schema)}.query_hits h
          USING doomed d
          WHERE h.id = d.id
          RETURNING h.url_id
        ),
        affected_urls AS (
          SELECT DISTINCT url_id
          FROM deleted_hits
        ),
        deleted_urls AS (
          DELETE FROM ${tx(schema)}.urls u
          USING affected_urls a
          WHERE u.id = a.url_id
            AND NOT EXISTS (
              SELECT 1
              FROM ${tx(schema)}.query_hits h
              WHERE h.url_id = u.id
            )
          RETURNING u.id
        )
        SELECT (SELECT COUNT(*) FROM deleted_hits)::int AS hits_deleted
      `;
      return rows;
    });

    return Number(row?.hits_deleted ?? 0);
  };

  const deleteOldUrlsBatch = async (limit: number): Promise<number> => {
    const [row] = await sql.begin(async (tx) => {
      const rows = await tx<{ urls_deleted: number }[]>`
        WITH doomed AS (
          SELECT id
          FROM ${tx(schema)}.urls
          ORDER BY last_seen ASC, id ASC
          LIMIT ${limit}
        ),
        deleted_urls AS (
          DELETE FROM ${tx(schema)}.urls u
          USING doomed d
          WHERE u.id = d.id
          RETURNING u.id
        )
        SELECT (SELECT COUNT(*) FROM deleted_urls)::int AS urls_deleted
      `;
      return rows;
    });

    return Number(row?.urls_deleted ?? 0);
  };

  if (cfg.maxAgeDays > 0) {
    const cutoff = Date.now() - cfg.maxAgeDays * 86_400_000;

    while (true) {
      const deleted = await deleteOldHitsBatch(cutoff);
      if (deleted === 0) break;
      if (deleted < BATCH_SIZE) break;
    }
  }

  if (!cfg.pruneEnabled) return;

  if (cfg.maxHits > 0) {
    let remainingHits = await countHits();

    while (remainingHits > cfg.maxHits) {
      const toDelete = Math.min(BATCH_SIZE, remainingHits - cfg.maxHits);
      const deleted = await deleteOldHitsBatchByCount(toDelete);
      if (deleted === 0) break;
      remainingHits -= deleted;
    }
  }

  if (cfg.maxUrls > 0) {
    let remainingUrls = await countUrls();

    while (remainingUrls > cfg.maxUrls) {
      const toDelete = Math.min(BATCH_SIZE, remainingUrls - cfg.maxUrls);
      const deleted = await deleteOldUrlsBatch(toDelete);
      if (deleted === 0) break;
      remainingUrls -= deleted;
    }
  }
};
