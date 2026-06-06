import type { IndexerAdapter } from "./adapter";
import { SqliteAdapter } from "./adapter-sqlite";
import { PgAdapter } from "./adapter-postgres";
import { logger } from "../utils/logger";

let _adapter: IndexerAdapter | null = null;

export const isPostgresMode = (): boolean => !!process.env.DEGOOG_POSTGRES;

export const getAdapter = (): IndexerAdapter => {
  if (!_adapter) {
    const pgUrl = process.env.DEGOOG_POSTGRES;
    _adapter = pgUrl ? new PgAdapter(pgUrl) : new SqliteAdapter();
  }
  return _adapter;
};

export const bootAdapter = async (): Promise<void> => {
  try {
    await getAdapter().boot();
  } catch (err) {
    logger.error("indexer", "adapter boot failed", err);
  }
};
