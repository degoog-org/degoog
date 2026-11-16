import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  cloneRepo,
  isOnBetaBranch,
  resolveTrackedBranch,
  syncBranch,
} from "../../src/server/extensions/store/git";
import { setRepoBeta } from "../../src/server/extensions/store/repo-ops";

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
    expect(await resolveTrackedBranch(dest)).toBe("develop");

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

describe("setRepoBeta", () => {
  const REPO_URL = "https://example.com/acme/beta.git";
  let root: string;
  let savedDataDir: string | undefined;
  let savedBeta: string | undefined;
  let run = 0;

  const gitc = (cwd: string, ...args: string[]): void =>
    git(cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args);

  const setup = async (
    branches: Record<string, string>,
    beta?: boolean,
  ): Promise<{ dataDir: string; clone: string; work: string }> => {
    const base = join(root, `run-${run++}`);
    const dataDir = join(base, "data");
    const work = join(base, "work");
    const clone = join(dataDir, "store", "acme-beta");
    Bun.spawnSync(["mkdir", "-p", work, join(dataDir, "store")]);
    process.env.DEGOOG_DATA_DIR = dataDir;
    const [first, ...rest] = Object.keys(branches);
    gitc(work, "init", "-q", "-b", first);
    for (const [i, name] of [first, ...rest].entries()) {
      if (i > 0) gitc(work, "checkout", "-q", "-b", name, first);
      await Bun.write(join(work, "package.json"), branches[name]);
      gitc(work, "add", ".");
      gitc(work, "commit", "-qm", name);
    }
    gitc(work, "checkout", "-q", first);
    git(base, "clone", "-q", "--depth", "1", `file://${work}`, clone);
    await Bun.write(
      join(dataDir, "repos.json"),
      JSON.stringify({
        installed: [],
        repos: [
          {
            url: REPO_URL,
            localPath: "acme-beta",
            addedAt: "2020-01-01T00:00:00.000Z",
            lastFetched: "2020-01-01T00:00:00.000Z",
            name: "Acme",
            description: "",
            error: null,
            ...(beta === undefined ? {} : { beta }),
          },
        ],
      }),
    );
    return { dataDir, clone, work };
  };

  const persistedBeta = async (dataDir: string): Promise<boolean | undefined> => {
    const data = (await Bun.file(join(dataDir, "repos.json")).json()) as {
      repos: Array<{ beta?: boolean }>;
    };
    return data.repos[0].beta;
  };

  beforeAll(async () => {
    savedDataDir = process.env.DEGOOG_DATA_DIR;
    savedBeta = process.env.DEGOOG_BETA_STORE;
    root = await mkdtemp(join(tmpdir(), "degoog-set-beta-"));
  });

  afterEach(() => {
    delete process.env.DEGOOG_BETA_STORE;
  });

  afterAll(async () => {
    if (savedDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = savedDataDir;
    if (savedBeta === undefined) delete process.env.DEGOOG_BETA_STORE;
    else process.env.DEGOOG_BETA_STORE = savedBeta;
    await rm(root, { recursive: true, force: true });
  });

  test("switches to develop and back, persisting the flag", async () => {
    const { dataDir, clone } = await setup({
      main: '{"name":"Acme"}',
      develop: '{"name":"Acme dev"}',
    });
    expect((await setRepoBeta(REPO_URL, true)).name).toBe("Acme dev");
    expect(await isOnBetaBranch(clone)).toBe(true);
    expect(await persistedBeta(dataDir)).toBe(true);

    await setRepoBeta(REPO_URL, false);
    expect(await isOnBetaBranch(clone)).toBe(false);
    expect(await persistedBeta(dataDir)).toBeUndefined();
  });

  test("turns beta off for a repo whose default branch is not main or master", async () => {
    const { dataDir, clone } = await setup({
      trunk: '{"name":"Acme"}',
      develop: '{"name":"Acme dev"}',
    });
    await setRepoBeta(REPO_URL, true);
    expect(await isOnBetaBranch(clone)).toBe(true);

    expect((await setRepoBeta(REPO_URL, false)).name).toBe("Acme");
    expect(await isOnBetaBranch(clone)).toBe(false);
    expect(await persistedBeta(dataDir)).toBeUndefined();
  });

  test("rejects and keeps the flag off when develop is missing", async () => {
    const { dataDir, clone } = await setup({ main: '{"name":"Acme"}' });
    await expect(setRepoBeta(REPO_URL, true)).rejects.toThrow('no "develop" branch');
    expect(await isOnBetaBranch(clone)).toBe(false);
    expect(await persistedBeta(dataDir)).toBeUndefined();
  });

  test("rejects and rolls back when the develop refresh fails", async () => {
    const { dataDir, clone } = await setup({ main: '{"name":"Acme"}', develop: "not json" });
    await expect(setRepoBeta(REPO_URL, true)).rejects.toThrow();
    expect(await isOnBetaBranch(clone)).toBe(false);
    expect(await persistedBeta(dataDir)).toBeUndefined();
  });

  test("keeps the default branch on its own code when the develop checkout fails", async () => {
    const { dataDir, clone, work } = await setup({
      main: '{"name":"Acme"}',
      develop: '{"name":"Acme dev"}',
    });
    gitc(work, "checkout", "-q", "develop");
    await Bun.write(join(work, "blocker.txt"), "tracked");
    gitc(work, "add", ".");
    gitc(work, "commit", "-qm", "blocker");
    gitc(work, "checkout", "-q", "main");
    await Bun.write(join(clone, "blocker.txt"), "untracked");

    await expect(setRepoBeta(REPO_URL, true)).rejects.toThrow(
      'Could not switch this repository to the "develop" branch.',
    );
    expect(await isOnBetaBranch(clone)).toBe(false);
    expect(await Bun.file(join(clone, "package.json")).text()).toBe('{"name":"Acme"}');
    expect(await persistedBeta(dataDir)).toBeUndefined();
  });

  test("rejects and keeps the flag on when the default branch is unreachable", async () => {
    const { dataDir, clone } = await setup({ develop: '{"name":"Acme dev"}' }, true);
    await expect(setRepoBeta(REPO_URL, false)).rejects.toThrow("default branch");
    expect(await isOnBetaBranch(clone)).toBe(true);
    expect(await persistedBeta(dataDir)).toBe(true);
  });

  test("rejects without touching the flag when DEGOOG_BETA_STORE is set", async () => {
    const { dataDir } = await setup({ main: '{"name":"Acme"}', develop: '{"name":"Acme dev"}' });
    process.env.DEGOOG_BETA_STORE = "1";
    await expect(setRepoBeta(REPO_URL, true)).rejects.toThrow("DEGOOG_BETA_STORE");
    expect(await persistedBeta(dataDir)).toBeUndefined();
  });
});
