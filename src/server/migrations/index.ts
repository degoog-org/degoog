import { logger } from "../utils/logger";
import { runStoreDirRename052026 } from "./2026-05-store-dir-rename";
import { runItemDirRename052026 } from "./2026-05-item-dir-rename";
import { runServerSettingsExtract052026 } from "./2026-05-server-settings-extract";
import { runCanonicalIds052026 } from "./2026-05-canonical-ids";
import { runBuiltinMigrations052026 } from "./2026-05-builtin-migrations";

/**
 * Self-contained migrations live in this directory.
 *
 * Each file is named `<YYYY>-<MM>-<short-slug>.ts` and exports:
 *   - `MIGRATION_VERSION`: numeric stamp matching the filename (e.g. `052026`)
 *   - `run<Slug><MIGRATION_VERSION>()`: idempotent async migration entrypoint
 *
 * Migrations are run in order from oldest to newest at server start.
 * Add a new migration by dropping a new file in this directory and importing
 * it here. Each migration must be safe to re-run.
 */
export const runMigrations = async (): Promise<void> => {
  try {
    await runStoreDirRename052026();
  } catch (err) {
    logger.error("migrations", "store-dir-rename failed", err);
  }
  try {
    await runItemDirRename052026();
  } catch (err) {
    logger.error("migrations", "item-dir-rename failed", err);
  }
  try {
    await runServerSettingsExtract052026();
  } catch (err) {
    logger.error("migrations", "server-settings-extract failed", err);
  }
  try {
    await runCanonicalIds052026();
  } catch (err) {
    logger.error("migrations", "canonical-ids failed", err);
  }
  try {
    await runBuiltinMigrations052026();
  } catch (err) {
    logger.error("migrations", "builtin-migrations failed", err);
  }
};
