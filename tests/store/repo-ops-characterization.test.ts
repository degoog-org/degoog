import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  addRepo,
  getRepos,
  getReposStatus,
  refreshAllRepos,
  refreshRepo,
  removeRepo,
} from "../../src/server/extensions/store/repo-ops";
import { ExtensionStoreType } from "../../src/server/types/extension";

const REPO_URL = "https://example.com/acme/ext.git";
const OFFICIAL_URL = "https://github.com/degoog-org/official-extensions.git";

const savedDataDir = process.env.DEGOOG_DATA_DIR;
let root = "";
let work = "";
let origin = "";
let clone = "";

const git = (cwd: string, ...args: string[]): string => {
  const p = Bun.spawnSync(
    ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "init.defaultBranch=main", ...args],
    { cwd },
  );
  if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr.toString()}`);
  return p.stdout.toString().trim();
};

const commitPackage = (name: string, extra: Record<string, unknown> = {}): void => {
  writeFileSync(join(work, "package.json"), JSON.stringify({ name, ...extra }));
  git(work, "add", ".");
  git(work, "commit", "-qm", name);
};

const repoEntry = (over: Record<string, unknown> = {}) => ({
  url: REPO_URL,
  localPath: "acme-ext",
  addedAt: "2020-01-01T00:00:00.000Z",
  lastFetched: "2020-01-01T00:00:00.000Z",
  name: "Acme v1",
  description: "",
  error: null,
  repoImage: null,
  ...over,
});

const writeRepos = (data: { repos: unknown[]; installed?: unknown[] }): void =>
  writeFileSync(
    join(process.env.DEGOOG_DATA_DIR!, "repos.json"),
    JSON.stringify({ installed: [], ...data }),
  );

const readRepos = () =>
  JSON.parse(readFileSync(join(process.env.DEGOOG_DATA_DIR!, "repos.json"), "utf8")) as {
    repos: ReturnType<typeof repoEntry>[];
    installed: unknown[];
  };

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "degoog-repo-ops-"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  if (savedDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
  else process.env.DEGOOG_DATA_DIR = savedDataDir;
});

beforeEach(() => {
  const run = mkdtempSync(join(root, "run-"));
  process.env.DEGOOG_DATA_DIR = join(run, "data");
  mkdirSync(join(process.env.DEGOOG_DATA_DIR, "store"), { recursive: true });
  work = join(run, "work");
  origin = join(run, "origin.git");
  clone = join(process.env.DEGOOG_DATA_DIR, "store", "acme-ext");
  mkdirSync(work);
  git(work, "init", "-q");
  commitPackage("Acme v1", { description: "first", "repo-image": "one.png" });
  git(work, "branch", "develop");
  git(run, "clone", "-q", "--bare", work, origin);
  git(work, "remote", "add", "origin", origin);
  git(run, "clone", "-q", "--depth", "1", `file://${origin}`, clone);
  writeRepos({ repos: [repoEntry()] });
});

const pushNewVersion = (name: string, extra: Record<string, unknown> = {}): void => {
  commitPackage(name, extra);
  git(work, "push", "-q", "origin", "main");
};

describe("refreshing a repo", () => {
  test("fetches, resets to origin and reloads the package metadata", async () => {
    pushNewVersion("Acme v2", { description: "second", "repo-image": "two.png" });
    await refreshRepo(REPO_URL);

    const [repo] = readRepos().repos;
    expect(repo).toMatchObject({ name: "Acme v2", description: "second", repoImage: "two.png", error: null });
    expect(repo.lastFetched).not.toBe("2020-01-01T00:00:00.000Z");
    expect(git(clone, "rev-parse", "HEAD")).toBe(git(work, "rev-parse", "HEAD"));
  });

  test("missing package fields keep the old name and description but drop the image", async () => {
    writeRepos({ repos: [repoEntry({ description: "kept", repoImage: "old.png" })] });
    writeFileSync(join(work, "package.json"), JSON.stringify({}));
    git(work, "commit", "-qam", "bare");
    git(work, "push", "-q", "origin", "main");
    await refreshRepo(REPO_URL);

    expect(readRepos().repos[0]).toMatchObject({ name: "Acme v1", description: "kept", repoImage: null });
  });

  test("an unknown url is refused", async () => {
    await expect(refreshRepo("https://example.com/nope/nope.git")).rejects.toThrow(
      "Repository not found.",
    );
  });

  test("a broken remote records a sanitized error and keeps lastFetched", async () => {
    git(clone, "remote", "set-url", "origin", join(root, "does-not-exist.git"));
    await refreshRepo(REPO_URL);

    const [repo] = readRepos().repos;
    expect(repo.error).toBeString();
    expect(repo.error).not.toContain(process.env.DEGOOG_DATA_DIR!);
    expect(repo.error).not.toContain(root);
    expect(repo.lastFetched).toBe("2020-01-01T00:00:00.000Z");
  });

  test("a stale shallow.lock is cleared and the fetch retried", async () => {
    pushNewVersion("Acme v3");
    writeFileSync(join(clone, ".git", "shallow.lock"), "");
    await refreshRepo(REPO_URL);

    expect(readRepos().repos[0]).toMatchObject({ name: "Acme v3", error: null });
    expect(existsSync(join(clone, ".git", "shallow.lock"))).toBe(false);
  });

  test("a clone left on the beta branch is moved back to main", async () => {
    git(clone, "fetch", "-q", "--depth", "1", "origin", "+develop:refs/remotes/origin/develop");
    git(clone, "checkout", "-q", "-B", "develop", "origin/develop");
    pushNewVersion("Acme main");
    await refreshRepo(REPO_URL);

    expect(git(clone, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(readRepos().repos[0].name).toBe("Acme main");
  });

  test("refresh all reports progress per repo and collects errors", async () => {
    writeRepos({
      repos: [repoEntry(), repoEntry({ url: "https://example.com/acme/gone.git", localPath: "gone" })],
    });
    const phases: string[] = [];
    const results = await refreshAllRepos((p) => phases.push(`${p.i}/${p.total} ${p.phase}`));

    expect(phases).toEqual(["1/2 start", "1/2 ok", "2/2 start", "2/2 failed"]);
    expect(results[0]).toEqual({ url: REPO_URL, error: null });
    expect(results[1].error).toBeString();
  });
});

describe("repo status", () => {
  test("a shallow clone reports at most one behind, and zero once refreshed", async () => {
    pushNewVersion("Acme v2");
    pushNewVersion("Acme v3");
    expect(await getReposStatus()).toEqual([{ url: REPO_URL, behind: 1 }]);

    await refreshRepo(REPO_URL);
    expect(await getReposStatus()).toEqual([{ url: REPO_URL, behind: 0 }]);
  });

  test("a repo whose fetch fails reports zero behind", async () => {
    git(clone, "remote", "set-url", "origin", join(root, "does-not-exist.git"));
    expect(await getReposStatus()).toEqual([{ url: REPO_URL, behind: 0 }]);
  });
});

describe("adding a repo", () => {
  test("a non git url is refused", async () => {
    await expect(addRepo("ftp://example.com/x")).rejects.toThrow("Invalid git URL.");
    await expect(addRepo("   ")).rejects.toThrow("Invalid git URL.");
  });

  test("a repo that is already added is refused, with or without .git", async () => {
    await expect(addRepo("https://example.com/acme/ext")).rejects.toThrow(
      "This repository is already added.",
    );
  });

  test("a clone that fails surfaces git's error and writes nothing", async () => {
    await expect(addRepo("https://127.0.0.1:1/acme/other.git")).rejects.toThrow();
    expect(readRepos().repos).toHaveLength(1);
  });
});

describe("removing a repo", () => {
  test("deletes the clone and the entry", async () => {
    await removeRepo("https://example.com/acme/ext");
    expect(readRepos().repos).toEqual([]);
    expect(existsSync(clone)).toBe(false);
  });

  test("refuses the official repo", async () => {
    writeRepos({ repos: [repoEntry({ url: OFFICIAL_URL, localPath: "official" })] });
    await expect(removeRepo(OFFICIAL_URL)).rejects.toThrow(
      "The official extensions repository cannot be removed.",
    );
  });

  test("refuses while items from it are installed", async () => {
    writeRepos({
      repos: [repoEntry()],
      installed: [
        {
          repoUrl: REPO_URL,
          type: ExtensionStoreType.Plugin,
          itemPath: "plugins/a",
          installedAs: "a",
          installedAt: "x",
          version: "1",
        },
      ],
    });
    await expect(removeRepo(REPO_URL)).rejects.toThrow("Uninstall these items first: plugin a");
  });

  test("an unknown url is refused", async () => {
    await expect(removeRepo("https://example.com/nope/nope.git")).rejects.toThrow(
      "Repository not found.",
    );
  });
});

describe("listing repos", () => {
  test("the official repo sorts first and the rest keep their order", async () => {
    writeRepos({
      repos: [
        repoEntry({ url: "https://example.com/a/one.git", localPath: "one" }),
        repoEntry({ url: OFFICIAL_URL, localPath: "official" }),
        repoEntry({ url: "https://example.com/a/two.git", localPath: "two" }),
      ],
    });
    expect((await getRepos()).map((r) => r.url)).toEqual([
      OFFICIAL_URL,
      "https://example.com/a/one.git",
      "https://example.com/a/two.git",
    ]);
  });

  test("the old official repo is migrated: installed items repointed, old clone removed", async () => {
    const oldUrl = "https://github.com/fccview/fccview-degoog-extensions.git";
    mkdirSync(join(process.env.DEGOOG_DATA_DIR!, "store", "old-official"));
    writeRepos({
      repos: [
        repoEntry({ url: OFFICIAL_URL, localPath: "official" }),
        repoEntry({ url: oldUrl, localPath: "old-official" }),
      ],
      installed: [
        {
          repoUrl: oldUrl,
          type: ExtensionStoreType.Theme,
          itemPath: "themes/t",
          installedAs: "t",
          installedAt: "x",
          version: "1",
        },
      ],
    });
    expect((await getRepos()).map((r) => r.url)).toEqual([OFFICIAL_URL]);
    expect((readRepos().installed[0] as { repoUrl: string }).repoUrl).toBe(OFFICIAL_URL);
    expect(existsSync(join(process.env.DEGOOG_DATA_DIR!, "store", "old-official"))).toBe(false);
  });
});
