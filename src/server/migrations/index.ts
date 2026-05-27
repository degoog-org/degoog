import { logger } from "../utils/logger";
import { runCanonicalIdsMigration052028 } from "./2026-05-canonical-ids-migration";

/**
 * This directory contains all migrations.
 * 
 * I don't suspect there will be many more but it's still worth make it to scale.
 * The idea being, all migrations are self contained and will be gated behind one `__schemaVersion`.
 * 
 * Next migration I'll simply need to add a new function here and run it, changing the `__schemaVersion` in the process.
 */
export const runMigrations = async (): Promise<void> => {
  try {
    await runCanonicalIdsMigration052028();
  } catch (err) {
    logger.error("migrations", "canonical ids migration failed", err);
  }
};
