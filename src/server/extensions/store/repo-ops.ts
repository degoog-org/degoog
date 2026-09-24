import { readFile, rm } from "fs/promises";
import { join } from "path";
import type { RepoInfo, RepoPackageJson } from "../../types/store";
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
import { clearItemCachesForRepo } from "./item-metadata";
import {
  behindCount,
  cloneRepo,
  fetchRef,
  hardReset,
  resolveTrackedBranch,
  syncBranch,
} from "./git";

const OFFICIAL_REPO_URL =
  "https://github.com/degoog-org/official-extensions.git";
const OLD_OFFICIAL_REPO_URL =
  "https://github.com/fccview/fccview-degoog-extensions.git";

const sameRepo = (a: string, b: string): boolean =>
  normalizeRepoUrl(a) === normalizeRepoUrl(b);

const readRepoPackage = async (repoPath: string): Promise<RepoPackageJson> =>
  JSON.parse(await readFile(join(repoPath, "package.json"), "utf-8")) as RepoPackageJson;

const applyPackage = (repo: RepoInfo, pkg: RepoPackageJson): void => {
  repo.name = pkg.name ?? repo.name;
  repo.description = pkg.description ?? repo.description;
  repo.repoImage = pkg["repo-image"] ?? null;
};

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

function isValidGitUrl(url: string): boolean {
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
  if (data.repos.some((r) => sameRepo(r.url, normalized))) {
    throw new Error("This repository is already added.");
  }
  const slug = slugFromUrl(url);
  const dest = join(getStoreDir(), slug);
  await cloneRepo(normalized, dest);
  let pkg: RepoPackageJson;
  try {
    pkg = await readRepoPackage(dest);
  } catch (err) {
    logger.warn("store:repo", `invalid package.json at ${join(dest, "package.json")}`, err);
    await rm(dest, { recursive: true, force: true });
    throw new Error("Repository has no valid package.json in the root.");
  }
  const now = new Date().toISOString();
  const repoInfo: RepoInfo = {
    url: normalized,
    localPath: slug,
    addedAt: now,
    lastFetched: now,
    name: slug,
    description: "",
    error: null,
  };
  applyPackage(repoInfo, pkg);
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
  if (sameRepo(repo.url, OFFICIAL_REPO_URL)) {
    throw new Error("The official extensions repository cannot be removed.");
  }
  const installedFromRepo = data.installed.filter((i) => sameRepo(i.repoUrl, url));
  if (installedFromRepo.length > 0) {
    const list = installedFromRepo
      .map((i) => `${i.type} ${i.installedAs}`)
      .join(", ");
    throw new Error(`Uninstall these items first: ${list}`);
  }
  const dest = join(getStoreDir(), repo.localPath);
  await rm(dest, { recursive: true, force: true }).catch(() => {});
  data.repos = data.repos.filter((r) => !sameRepo(r.url, url));
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
    clearItemCachesForRepo(repoPath);
    repo.error = null;
    repo.lastFetched = new Date().toISOString();
    applyPackage(repo, await readRepoPackage(repoPath));
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

interface RefreshProgress {
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

interface RepoStatus {
  url: string;
  behind: number;
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
        const behind = await behindCount(repoPath, `origin/${branch}`);
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
  const oldRepo = data.repos.find((r) => sameRepo(r.url, OLD_OFFICIAL_REPO_URL));
  if (!oldRepo) return;

  const newNormalized = normalizeRepoUrl(OFFICIAL_REPO_URL);
  if (!data.repos.some((r) => sameRepo(r.url, newNormalized))) {
    try {
      await addRepo(OFFICIAL_REPO_URL);
    } catch (err) {
      logger.warn("store:repo", "official repo migration add failed", err);
      return;
    }
  }

  const updated = await readReposData();
  for (const item of updated.installed) {
    if (sameRepo(item.repoUrl, OLD_OFFICIAL_REPO_URL)) {
      item.repoUrl = newNormalized;
    }
  }
  updated.repos = updated.repos.filter((r) => !sameRepo(r.url, OLD_OFFICIAL_REPO_URL));
  await writeReposData(updated);
  await rm(join(getStoreDir(), oldRepo.localPath), {
    recursive: true,
    force: true,
  }).catch(() => {});
}

async function ensureOfficialRepo(): Promise<void> {
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
  return [...data.repos].sort((a, b) => {
    if (sameRepo(a.url, OFFICIAL_REPO_URL)) return -1;
    if (sameRepo(b.url, OFFICIAL_REPO_URL)) return 1;
    return 0;
  });
}
