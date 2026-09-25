import type { Database } from "bun:sqlite";

const HITS_SCHEMA_VERSION = 1;

export const migrateHits = (db: Database): void => {
  const { user_version: version } = db
    .prepare("PRAGMA user_version")
    .get() as { user_version: number };
  if (version >= HITS_SCHEMA_VERSION) return;

  const existing = new Set(
    (db.prepare("PRAGMA table_info(query_hits)").all() as { name: string }[]).map(
      (col) => col.name,
    ),
  );
  const addColumn = (name: string, ddl: string): void => {
    if (!existing.has(name)) db.exec(`ALTER TABLE query_hits ADD COLUMN ${ddl}`);
  };
  const needsBackfill = !existing.has("pos_sum");
  addColumn("pos_sum", "pos_sum INTEGER NOT NULL DEFAULT 9999");
  addColumn("sources_json", "sources_json TEXT");
  addColumn("filters_json", "filters_json TEXT");
  addColumn("meta_json", "meta_json TEXT");

  if (needsBackfill) {
    db.exec("UPDATE query_hits SET pos_sum = best_position * hit_count");
  }
  db.exec(`PRAGMA user_version = ${HITS_SCHEMA_VERSION}`);
};
