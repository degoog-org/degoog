import { existsSync } from "fs";
import type { Subprocess, Server } from "bun";
import { logger } from "./logger";
import { closeAllDbs } from "../indexer/db";
import { stopQueue } from "../indexer/queue";
import { clearRestartPending } from "./restart-state";
import { envTruthy } from "../routes/settings-auth";

const RESTART_EXIT_DELAY_MS = 250;

let _serverHandle: Server | undefined;

export const registerServerHandle = (server: Server): void => {
  _serverHandle = server;
};

export const isDockerRuntime = (): boolean =>
  envTruthy("DEGOOG_DOCKER") || existsSync("/.dockerenv");

const hasControllingTerminal = (): boolean => Boolean(process.stdout.isTTY);

/**
 * @fccview here hack time!
 * Restarting in docker is piss easy, you just kill the app and pray the user has a restart policy set up.
 *
 * On native runs, proxmox or whatever shit you all run this stuff on, I'm gonna spawn a new process to replace the
 * current one as you exit to give the illusion it's restarting.
 */
const spawnReplacementProcess = (): Subprocess | undefined => {
  if (isDockerRuntime()) return undefined;

  try {
    const child = Bun.spawn({
      cmd: [...process.argv],
      cwd: process.cwd(),
      env: process.env,
      stdio: ["inherit", "inherit", "inherit"],
      detached: !hasControllingTerminal(),
    });

    if (!hasControllingTerminal()) child.unref();
    return child;
  } catch (err) {
    logger.warn("server", "failed to spawn replacement process for restart", err);
    return undefined;
  }
};

const becomeSignalForwarder = (child: Subprocess): void => {
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  process.once("SIGINT", () => child.kill("SIGINT"));
  process.once("SIGTERM", () => child.kill("SIGTERM"));
  child.exited.then((code) => process.exit(code ?? 0));
};

export const requestRestart = (reason: string): void => {
  logger.info("server", `restart requested: ${reason}`);
  clearRestartPending();
  setTimeout(() => {
    _serverHandle?.stop(true);
    const child = spawnReplacementProcess();
    stopQueue()
      .finally(async () => {
        await closeAllDbs();
        if (child && hasControllingTerminal()) {
          becomeSignalForwarder(child);
        } else {
          process.exit(0);
        }
      });
  }, RESTART_EXIT_DELAY_MS);
};
