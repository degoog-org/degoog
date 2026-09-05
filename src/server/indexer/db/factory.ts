import type { IndexerAdapter } from "../types/adapter";
import { SqliteAdapter, PgAdapter } from "../adapters";
import { logger } from "../../utils/logger";
import { resolvePgConfig } from "./pg-config";

let _adapter: IndexerAdapter | null = null;

export const isPostgresMode = (): boolean => resolvePgConfig().mode !== "sqlite";

export const getAdapter = (): IndexerAdapter => {
  if (!_adapter) {
    const resolved = resolvePgConfig();
    _adapter =
      resolved.mode === "url"
        ? new PgAdapter(resolved.url)
        : resolved.mode === "config"
          ? new PgAdapter(resolved.config)
          : new SqliteAdapter();
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
