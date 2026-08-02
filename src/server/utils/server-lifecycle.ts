import { existsSync, readFileSync } from "fs";
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

/** systemd sets INVOCATION_ID for every service it supervises, restart-on-failure or not */
export const isSystemdService = (): boolean => Boolean(process.env.INVOCATION_ID);

const SYSTEMD_RECOVERING_RESTART_POLICIES = new Set([
  "always",
  "on-failure",
  "on-abnormal",
  "on-watchdog",
  "on-abort",
]);

/** Best-effort: resolve our own unit name from the cgroup path and ask systemd for its Restart= policy */
const detectSystemdRestartPolicy = (): boolean => {
  try {
    const cgroup = readFileSync("/proc/self/cgroup", "utf8");
    /* fccview is onto you! nested slices mean the leaf component is our unit, not the first match */
    const unit = cgroup
      .split(/[\n/]/)
      .filter((part) => /^[\w.@-]+\.service$/.test(part))
      .pop();
    if (!unit) return false;

    const result = Bun.spawnSync(["systemctl", "show", unit, "--property=Restart", "--value"]);
    if (result.exitCode !== 0) return false;

    const policy = result.stdout.toString().trim();
    return SYSTEMD_RECOVERING_RESTART_POLICIES.has(policy);
  } catch (err) {
    logger.debug("server", "systemd restart policy detection failed", err);
    return false;
  }
};

/**
 * INVOCATION_ID alone doesn't prove the unit has Restart=on-failure/always configured, so exiting
 * non-zero and trusting systemd to bring us back is only safe once that's confirmed - either by
 * auto-detecting the unit's actual policy, or by the user opting in when detection isn't possible.
 */
export const isSystemdRestartConfigured = (): boolean =>
  envTruthy("DEGOOG_SYSTEMD_RESTART_CONFIGURED") || detectSystemdRestartPolicy();

const hasControllingTerminal = (): boolean => Boolean(process.stdout.isTTY);

/**
 * @fccview here hack time!
 * Restarting in docker is piss easy, you just kill the app and pray the user has a restart policy set up.
 *
 * On native runs, proxmox or whatever shit you all run this stuff on, I'm gonna spawn a new process to replace the
 * current one as you exit to give the illusion it's restarting.
 */
const spawnReplacementProcess = (systemdWillRestart: boolean): Subprocess | undefined => {
  if (isDockerRuntime() || systemdWillRestart) return undefined;

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
    const underSystemd = isSystemdService();
    const systemdWillRestart = underSystemd && isSystemdRestartConfigured();
    if (underSystemd && !systemdWillRestart) {
      logger.warn(
        "server",
        "running under systemd but couldn't confirm a recovering Restart= policy (auto-detect failed " +
          "and DEGOOG_SYSTEMD_RESTART_CONFIGURED is not set); falling back to self-managed restart",
      );
    }
    const exitCode = systemdWillRestart ? 1 : 0;
    const child = spawnReplacementProcess(systemdWillRestart);
    stopQueue()
      .finally(async () => {
        await closeAllDbs();
        if (child && hasControllingTerminal()) {
          becomeSignalForwarder(child);
        } else {
          process.exit(exitCode);
        }
      });
  }, RESTART_EXIT_DELAY_MS);
};
