import { logger } from "./logger";
import { closeAllDbs } from "../indexer/db";
import { stopQueue } from "../indexer/queue";
import { clearRestartPending } from "./restart-state";
import { envTruthy } from "../routes/settings-auth";

const RESTART_EXIT_DELAY_MS = 250;

/**
 * @fccview here - bare `bun run`/`bun develop` processes have no supervisor to bring 
 * them back up after `process.exit`, so gotta spawn our own replacement before
 * exiting. Under Docker (PID 1, no init), this child dies alongside the
 * container, however I much rather lock it behind a flag so it only runs
 * when I want it to.
 */
const spawnReplacementProcess = (): void => {
  if (!envTruthy("DEGOOG_DEV_MODE")) return;

  try {
    Bun.spawn({
      cmd: [...process.argv],
      cwd: process.cwd(),
      env: process.env,
      stdio: ["inherit", "inherit", "inherit"],
      detached: true,
    }).unref();
  } catch (err) {
    logger.warn("server", "failed to spawn replacement process for restart", err);
  }
};

export const requestRestart = (reason: string): void => {
  logger.info("server", `restart requested: ${reason}`);
  clearRestartPending();
  setTimeout(() => {
    spawnReplacementProcess();
    stopQueue()
      .finally(() => {
        closeAllDbs();
        process.exit(0);
      });
  }, RESTART_EXIT_DELAY_MS);
};
