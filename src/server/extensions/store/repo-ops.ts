import { readFile, rm, realpath } from "fs/promises";
import { join, relative, isAbsolute } from "path";
import type { RepoInfo, RepoPackageJson } from "../../types";
import type { StoreStreamPhase } from "../../../shared/store-stream";
import { logger } from "../../utils/logger";
import { runStoreExclusive } from "./store-lock";
import {
  normalizeRepoUrl,
  getStoreDir,
  readReposData,
  writeReposData,
  getRepoByUrl,
} from "./persistence";

const CLONE_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const OFFICIAL_REPO_URL =
  "https://github.com/degoog-org/official-extensions.git";
const OLD_OFFICIAL_REPO_URL =
  "https://github.com/fccview/fccview-degoog-extensions.git";
const DEGOOG_BETA_STORE = process.env.DEGOOG_BETA_STORE === "1";
const BETA_BRANCH = "develop";

const _isLockError = (stderr: string): boolean =>
  /shallow\.lock|shallow file has changed|index\.lock|another git process/i.test(
    stderr,
  );

const STALE_LOCK_FILES = ["shallow.lock", "index.lock"];

const _isInsideStore = async (repoPath: string): Promise<boolean> => {
  try {
    const root = await realpath(getStoreDir());
    const target = await realpath(repoPath);
    const rel = relative(root, target);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  } catch (err) {
    logger.warn("store:repo", `could not resolve repo path ${repoPath}`, err);
    return false;
  }
};

const _cleanGitLocks = async (repoPath: string): Promise<void> => {
  if (!(await _isInsideStore(repoPath))) {
    logger.warn(
      "store:repo",
      `refusing to clean locks outside store dir: ${repoPath}`,
    );
    return;
  }
  const gitDir = join(repoPath, ".git");
  await Promise.all(
    STALE_LOCK_FILES.map((name) =>
      rm(join(gitDir, name), { force: true }).catch((err) =>
        logger.debug(
          "store:repo",
          `could not remove stale ${name} in ${repoPath}`,
          err,
        ),
      ),
    ),
  );
};

const probeBranch = async (url: string, branch: string): Promise<boolean> => {
  const proc = Bun.spawn(["git", "ls-remote", "--heads", url, branch], {
    stdout: "pipe",
    stderr: "ignore",
  });
  await Promise.race([
    proc.exited,
    new Promise<void>((_, rej) =>
      setTimeout(() => {
        proc.kill();
        rej();
      }, FETCH_TIMEOUT_MS),
    ),
  ]).catch(() => {});
  const out = await new Response(proc.stdout).text();
  return out.trim().length > 0;
};

const branchExists = async (
  repoPath: string,
  ref: string,
): Promise<boolean> => {
  const proc = Bun.spawn(
    ["git", "-C", repoPath, "rev-parse", "--verify", ref],
    {
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  const exit = await proc.exited;
  return exit === 0;
};

const headBranch = async (repoPath: string): Promise<string> => {
  const proc = Bun.spawn(
    ["git", "-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"],
    {
      stdout: "pipe",
      stderr: "ignore",
    },
  );
  await proc.exited;
  return (await new Response(proc.stdout).text()).trim();
};

const _runFetchRef = async (
  repoPath: string,
  branch: string,
): Promise<{ exit: number; stderr: string; timedOut: boolean }> => {
  const proc = Bun.spawn(
    [
      "git",
      "-C",
      repoPath,
      "fetch",
      "--depth",
      "1",
      "origin",
      `+${branch}:refs/remotes/origin/${branch}`,
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, FETCH_TIMEOUT_MS);
  try {
    const exit = await proc.exited;
    const stderr = exit === 0 ? "" : await new Response(proc.stderr).text();
    return { exit, stderr, timedOut };
  } finally {
    clearTimeout(timer);
  }
};

const fetchRef = async (
  repoPath: string,
  branch: string,
): Promise<{ ok: boolean; notFound: boolean; error: string }> => {
  let { exit, stderr, timedOut } = await _runFetchRef(repoPath, branch);
  if (exit !== 0 && !timedOut && _isLockError(stderr)) {
    logger.warn(
      "store:repo",
      `git lock detected during fetch, clearing stale locks and retrying`,
    );
    await _cleanGitLocks(repoPath);
    ({ exit, stderr, timedOut } = await _runFetchRef(repoPath, branch));
  }
  if (exit === 0) return { ok: true, notFound: false, error: "" };
  const notFound =
    /couldn't find remote ref|remote ref does not exist|invalid refspec/i.test(
      stderr,
    );
  return {
    ok: false,
    notFound,
    error: timedOut ? "Fetch timed out" : _sanitizeGitError(stderr),
  };
};

const switchBranch = async (
  repoPath: string,
  branch: string,
): Promise<{ ok: boolean; notFound: boolean }> => {
  const fetched = await fetchRef(repoPath, branch);
  if (!fetched.ok) return { ok: false, notFound: fetched.notFound };
  const proc = Bun.spawn(
    ["git", "-C", repoPath, "checkout", "-B", branch, `origin/${branch}`],
    { stdout: "ignore", stderr: "ignore" },
  );
  return { ok: (await proc.exited) === 0, notFound: false };
};

const hardReset = async (
  repoPath: string,
  ref: string,
): Promise<{ ok: boolean; error: string }> => {
  const proc = Bun.spawn(["git", "-C", repoPath, "reset", "--hard", ref], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const exit = await proc.exited;
  if (exit === 0) return { ok: true, error: "" };
  return {
    ok: false,
    error: _sanitizeGitError(await new Response(proc.stderr).text()),
  };
};

const syncBranch = async (repoPath: string): Promise<void> => {
  const current = await headBranch(repoPath);
  if (DEGOOG_BETA_STORE) {
    if (current === BETA_BRANCH) return;
    const result = await switchBranch(repoPath, BETA_BRANCH);
    if (!result.ok) {
      if (result.notFound) {
        logger.debug(
          "store:branch",
          `repo has no "${BETA_BRANCH}" branch, staying on "${current}" - normal for third-party repos`,
        );
      } else {
        logger.warn(
          "store:branch",
          `failed to switch repo to "${BETA_BRANCH}", staying on "${current}"`,
        );
      }
    }
    return;
  }
  if (current === BETA_BRANCH) {
    const main = await switchBranch(repoPath, "main");
    const reverted = main.ok || (await switchBranch(repoPath, "master")).ok;
    if (!reverted) {
      logger.warn("store:branch", `could not revert repo off ${BETA_BRANCH}`);
    }
  }
};

const resolveTrackedBranch = async (repoPath: string): Promise<string> => {
  const useBeta =
    DEGOOG_BETA_STORE &&
    (await branchExists(repoPath, `origin/${BETA_BRANCH}`));
  return useBeta ? BETA_BRANCH : await headBranch(repoPath);
};

function _sanitizeGitError(raw: string): string {
  if (!raw) return raw;
  const storeDir = getStoreDir();
  const cwd = process.cwd();
  return raw
    .replaceAll(storeDir, "<store>")
    .replaceAll(cwd, "<workdir>")
    .replace(/'\/[^'\n]*'/g, "'<path>'")
    .replace(/\/[A-Za-z0-9_./-]+\/(?=\.git\b)/g, "<path>/")
    .trim();
}

export const slugFromUrl = (url: string): string => {
  const normalized = normalizeRepoUrl(url);
  let author = "anon";
  let repoName = "repo";
  try {
    const u = new URL(normalized.replace(/\.git$/, ""));
    const segments = u.pathname.split("/").filter(Boolean);
    repoName = (segments.pop() ?? "repo").replace(/\.git$/, "") || "repo";
    author = segments.pop() ?? "anon";
  } catch (err) {
    logger.warn(
      "store:slug",
      `failed to parse repo URL "${url}", using defaults`,
      err,
    );
  }
  const safe = (s: string): string =>
    s.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 48);
  return `${safe(author)}-${safe(repoName)}`;
};

export function isValidGitUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed.replace(/\.git$/, ""));
    return (
      u.protocol === "http:" || u.protocol === "https:" || u.protocol === "ssh:"
    );
  } catch (err) {
    logger.debug("store:repo", `invalid git URL "${trimmed}"`, err);
    return false;
  }
}

export function addRepo(url: string): Promise<RepoInfo> {
  return runStoreExclusive(() => _addRepo(url));
}

export async function _addRepo(url: string): Promise<RepoInfo> {
  if (!isValidGitUrl(url)) {
    throw new Error(
      "Invalid git URL. Use http(s) or ssh URL ending in .git or without.",
    );
  }
  const normalized = normalizeRepoUrl(url);
  const data = await readReposData();
  if (data.repos.some((r) => normalizeRepoUrl(r.url) === normalized)) {
    throw new Error("This repository is already added.");
  }
  const slug = slugFromUrl(url);
  const storeDir = getStoreDir();
  const dest = join(storeDir, slug);
  const useBeta =
    DEGOOG_BETA_STORE && (await probeBranch(normalized, BETA_BRANCH));
  const cloneArgs = useBeta
    ? [
        "git",
        "clone",
        "--depth",
        "1",
        "--branch",
        BETA_BRANCH,
        normalized,
        dest,
      ]
    : ["git", "clone", "--depth", "1", normalized, dest];
  const proc = Bun.spawn(cloneArgs, {
    cwd: storeDir,
    stdout: "ignore",
    stderr: "pipe",
  });
  const exit = await Promise.race([
    proc.exited,
    new Promise<number>((_, rej) =>
      setTimeout(() => {
        proc.kill();
        rej(new Error("Clone timed out"));
      }, CLONE_TIMEOUT_MS),
    ),
  ]);
  if (exit !== 0) {
    const err = _sanitizeGitError(await new Response(proc.stderr).text());
    throw new Error(err || `Git clone failed with code ${exit}`);
  }
  const pkgPath = join(dest, "package.json");
  let pkg: RepoPackageJson;
  try {
    const raw = await readFile(pkgPath, "utf-8");
    pkg = JSON.parse(raw) as RepoPackageJson;
  } catch (err) {
    logger.warn("store:repo", `invalid package.json at ${pkgPath}`, err);
    await rm(dest, { recursive: true, force: true });
    throw new Error("Repository has no valid package.json in the root.");
  }
  const now = new Date().toISOString();
  const repoInfo: RepoInfo = {
    url: normalized,
    localPath: slug,
    addedAt: now,
    lastFetched: now,
    name: pkg.name ?? slug,
    description: pkg.description ?? "",
    error: null,
    repoImage: pkg["repo-image"] ?? null,
  };
  data.repos.push(repoInfo);
  await writeReposData(data);
  return repoInfo;
}

export function removeRepo(url: string): Promise<void> {
  return runStoreExclusive(() => _removeRepo(url));
}

async function _removeRepo(url: string): Promise<void> {
  const data = await readReposData();
  const repo = getRepoByUrl(data, url);
  if (!repo) throw new Error("Repository not found.");
  if (normalizeRepoUrl(repo.url) === normalizeRepoUrl(OFFICIAL_REPO_URL)) {
    throw new Error("The official extensions repository cannot be removed.");
  }
  const installedFromRepo = data.installed.filter(
    (i) => normalizeRepoUrl(i.repoUrl) === normalizeRepoUrl(url),
  );
  if (installedFromRepo.length > 0) {
    const list = installedFromRepo
      .map((i) => `${i.type} ${i.installedAs}`)
      .join(", ");
    throw new Error(`Uninstall these items first: ${list}`);
  }
  const dest = join(getStoreDir(), repo.localPath);
  await rm(dest, { recursive: true, force: true }).catch(() => {});
  data.repos = data.repos.filter(
    (r) => normalizeRepoUrl(r.url) !== normalizeRepoUrl(url),
  );
  await writeReposData(data);
}

async function _refreshRepo(repo: RepoInfo): Promise<void> {
  const repoPath = join(getStoreDir(), repo.localPath);
  try {
    await syncBranch(repoPath);
    const branch = await resolveTrackedBranch(repoPath);
    const fetched = await fetchRef(repoPath, branch);
    if (!fetched.ok) {
      repo.error = fetched.error || `Git fetch failed for ${branch}`;
      return;
    }
    const reset = await hardReset(repoPath, `origin/${branch}`);
    if (!reset.ok) {
      repo.error = reset.error || `Git reset failed for ${branch}`;
      return;
    }
    repo.error = null;
    repo.lastFetched = new Date().toISOString();
    const pkgPath = join(repoPath, "package.json");
    const raw = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as RepoPackageJson;
    repo.name = pkg.name ?? repo.name;
    repo.description = pkg.description ?? repo.description;
    repo.repoImage = pkg["repo-image"] ?? null;
  } catch (e) {
    repo.error = e instanceof Error ? e.message : String(e);
  }
}

export function refreshRepo(url?: string): Promise<void> {
  return runStoreExclusive(async () => {
    const data = await readReposData();
    let toRefresh: RepoInfo[];
    if (url) {
      const repo = getRepoByUrl(data, url);
      if (!repo) throw new Error("Repository not found.");
      toRefresh = [repo];
    } else {
      toRefresh = data.repos;
    }
    for (const repo of toRefresh) await _refreshRepo(repo);
    await writeReposData(data);
  });
}

export interface RefreshProgress {
  url: string;
  name: string;
  i: number;
  total: number;
  phase: StoreStreamPhase;
  error?: string;
}

export function refreshAllRepos(
  onProgress?: (p: RefreshProgress) => void,
): Promise<{ url: string; error: string | null }[]> {
  return runStoreExclusive(async () => {
    const data = await readReposData();
    const results: { url: string; error: string | null }[] = [];
    const total = data.repos.length;
    for (let idx = 0; idx < total; idx++) {
      const repo = data.repos[idx];
      const base = { url: repo.url, name: repo.name, i: idx + 1, total };
      onProgress?.({ ...base, phase: "start" });
      await _refreshRepo(repo);
      results.push({ url: repo.url, error: repo.error });
      onProgress?.({
        ...base,
        phase: repo.error ? "failed" : "ok",
        ...(repo.error ? { error: repo.error } : {}),
      });
    }
    await writeReposData(data);
    return results;
  });
}

export interface RepoStatus {
  url: string;
  behind: number;
}

async function getBehindCount(
  repoPath: string,
  remoteRef: string,
): Promise<number> {
  const countProc = Bun.spawn(
    ["git", "-C", repoPath, "rev-list", "--count", `HEAD..${remoteRef}`],
    { stdout: "pipe", stderr: "ignore" },
  );
  const exit = await countProc.exited;
  if (exit !== 0) return 0;
  const out = await new Response(countProc.stdout).text();
  const n = parseInt(out.trim(), 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

export function getReposStatus(): Promise<RepoStatus[]> {
  return runStoreExclusive(async () => {
    const data = await readReposData();
    const storeDir = getStoreDir();
    const results: RepoStatus[] = [];
    for (const repo of data.repos) {
      const repoPath = join(storeDir, repo.localPath);
      try {
        const branch = await resolveTrackedBranch(repoPath);
        const fetched = await fetchRef(repoPath, branch);
        if (!fetched.ok) {
          results.push({ url: repo.url, behind: 0 });
          continue;
        }
        const behind = await getBehindCount(repoPath, `origin/${branch}`);
        results.push({ url: repo.url, behind });
      } catch (err) {
        logger.warn("store:repo", `status check failed for ${repo.url}`, err);
        results.push({ url: repo.url, behind: 0 });
      }
    }
    return results;
  });
}

async function _migrateOfficialRepo(): Promise<void> {
  const data = await readReposData();
  const oldNormalized = normalizeRepoUrl(OLD_OFFICIAL_REPO_URL);
  const oldRepo = data.repos.find(
    (r) => normalizeRepoUrl(r.url) === oldNormalized,
  );
  if (!oldRepo) return;

  const newNormalized = normalizeRepoUrl(OFFICIAL_REPO_URL);
  if (!data.repos.some((r) => normalizeRepoUrl(r.url) === newNormalized)) {
    try {
      await addRepo(OFFICIAL_REPO_URL);
    } catch (err) {
      logger.warn("store:repo", "official repo migration add failed", err);
      return;
    }
  }

  const updated = await readReposData();
  for (const item of updated.installed) {
    if (normalizeRepoUrl(item.repoUrl) === oldNormalized) {
      item.repoUrl = newNormalized;
    }
  }
  updated.repos = updated.repos.filter(
    (r) => normalizeRepoUrl(r.url) !== oldNormalized,
  );
  await writeReposData(updated);
  await rm(join(getStoreDir(), oldRepo.localPath), {
    recursive: true,
    force: true,
  }).catch(() => {});
}

export async function ensureOfficialRepo(): Promise<void> {
  const data = await readReposData();
  if (data.repos.length > 0) return;
  try {
    await addRepo(OFFICIAL_REPO_URL);
  } catch (err) {
    logger.warn("store:repo", "official repo bootstrap failed", err);
  }
}

export async function getRepos(): Promise<RepoInfo[]> {
  await _migrateOfficialRepo();
  await ensureOfficialRepo();
  const data = await readReposData();
  const officialNormalized = normalizeRepoUrl(OFFICIAL_REPO_URL);
  return [...data.repos].sort((a, b) => {
    if (normalizeRepoUrl(a.url) === officialNormalized) return -1;
    if (normalizeRepoUrl(b.url) === officialNormalized) return 1;
    return 0;
  });
}
