import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  cloneRepo,
  isOnBetaBranch,
  resolveTrackedBranch,
  syncBranch,
} from "../../src/server/extensions/store/git";

const git = (cwd: string, ...args: string[]): void => {
  const r = Bun.spawnSync(["git", ...args], { cwd });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
};

describe("per-repo develop branch", () => {
  let tmp: string;
  let origin: string;
  let savedStoreDir: string | undefined;
  let savedBeta: string | undefined;

  beforeAll(async () => {
    savedStoreDir = process.env.DEGOOG_DATA_DIR;
    savedBeta = process.env.DEGOOG_BETA_STORE;
    tmp = await mkdtemp(join(tmpdir(), "degoog-beta-"));
    process.env.DEGOOG_DATA_DIR = tmp;
    delete process.env.DEGOOG_BETA_STORE;
    origin = join(tmp, "origin");
    Bun.spawnSync(["mkdir", "-p", origin, join(tmp, "store")]);
    git(origin, "init", "-b", "main");
    git(origin, "config", "user.email", "t@t");
    git(origin, "config", "user.name", "t");
    git(origin, "commit", "--allow-empty", "-m", "main");
    git(origin, "checkout", "-b", "develop");
    git(origin, "commit", "--allow-empty", "-m", "dev");
    git(origin, "checkout", "main");
  });

  afterAll(async () => {
    if (savedStoreDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = savedStoreDir;
    if (savedBeta === undefined) delete process.env.DEGOOG_BETA_STORE;
    else process.env.DEGOOG_BETA_STORE = savedBeta;
    await rm(tmp, { recursive: true, force: true });
  });

  test("flag switches to develop and back; env var forces develop", async () => {
    const dest = join(tmp, "store", "clone");
    await cloneRepo(`file://${origin}`, dest);
    expect(await isOnBetaBranch(dest)).toBe(false);

    await syncBranch(dest, true);
    expect(await isOnBetaBranch(dest)).toBe(true);
    expect(await resolveTrackedBranch(dest, true)).toBe("develop");

    await syncBranch(dest, false);
    expect(await isOnBetaBranch(dest)).toBe(false);

    process.env.DEGOOG_BETA_STORE = "1";
    await syncBranch(dest, false);
    expect(await isOnBetaBranch(dest)).toBe(true);
    delete process.env.DEGOOG_BETA_STORE;
    await syncBranch(dest, false);
    expect(await isOnBetaBranch(dest)).toBe(false);
  });
});
