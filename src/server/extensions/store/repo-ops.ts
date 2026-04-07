import { readFile, rm } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import type { RepoInfo, RepoPackageJson } from "../../types";
import {
  normalizeRepoUrl,
  getStoreDir,
  readReposData,
  writeReposData,
  getRepoByUrl,
} from "./persistence";

const CLONE_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const OFFICIAL_REPO_URL = "https://github.com/fccview/fccview-degoog-extensions.git";

export function slugFromUrl(url: string): string {
  const normalized = normalizeRepoUrl(url);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 8);
  let repoName = "repo";
  try {
    const u = new URL(normalized.replace(/\.git$/, ""));
    const segments = u.pathname.split("/").filter(Boolean);
    repoName = (segments.pop() ?? "repo").replace(/\.git$/, "") || "repo";
  } catch {
    repoName = "repo";
  }
  const safeName = repoName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 32);
  return `${hash}-${safeName}`;
}

export function isValidGitUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed.replace(/\.git$/, ""));
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "ssh:";
  } catch {
    return false;
  }
}

export async function addRepo(url: string): Promise<RepoInfo> {
  if (!isValidGitUrl(url)) {
    throw new Error("Invalid git URL. Use http(s) or ssh URL ending in .git or without.");
  }
  const normalized = normalizeRepoUrl(url);
  const data = await readReposData();
  if (data.repos.some((r) => normalizeRepoUrl(r.url) === normalized)) {
    throw new Error("This repository is already added.");
  }
  const slug = slugFromUrl(url);
  const storeDir = getStoreDir();
  const dest = join(storeDir, slug);
  const proc = Bun.spawn(["git", "clone", "--depth", "1", normalized, dest], {
    cwd: storeDir,
    stdout: "ignore",
    stderr: "pipe",
  });
  const exit = await Promise.race([
    proc.exited,
    new Promise<number>((_, rej) =>
      setTimeout(() => { proc.kill(); rej(new Error("Clone timed out")); }, CLONE_TIMEOUT_MS),
    ),
  ]);
  if (exit !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(err || `Git clone failed with code ${exit}`);
  }
  const pkgPath = join(dest, "package.json");
  let pkg: RepoPackageJson;
  try {
    const raw = await readFile(pkgPath, "utf-8");
    pkg = JSON.parse(raw) as RepoPackageJson;
  } catch {
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

export async function removeRepo(url: string): Promise<void> {
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
    const list = installedFromRepo.map((i) => `${i.type} ${i.installedAs}`).join(", ");
    throw new Error(`Uninstall these items first: ${list}`);
  }
  const dest = join(getStoreDir(), repo.localPath);
  await rm(dest, { recursive: true, force: true }).catch(() => {});
  data.repos = data.repos.filter((r) => normalizeRepoUrl(r.url) !== normalizeRepoUrl(url));
  await writeReposData(data);
}

export async function refreshRepo(url?: string): Promise<void> {
  const data = await readReposData();
  const repos = url ? [getRepoByUrl(data, url)] : data.repos;
  const toRefresh = repos.filter((r): r is RepoInfo => r != null);
  for (const repo of toRefresh) {
    const repoPath = join(getStoreDir(), repo.localPath);
    try {
      const proc = Bun.spawn(["git", "-C", repoPath, "pull"], {
        stdout: "ignore",
        stderr: "pipe",
      });
      const exit = await proc.exited;
      if (exit !== 0) {
        const err = await new Response(proc.stderr).text();
        repo.error = err || `Git pull failed (${exit})`;
        continue;
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
  await writeReposData(data);
}

export async function refreshAllRepos(): Promise<{ url: string; error: string | null }[]> {
  const data = await readReposData();
  const results: { url: string; error: string | null }[] = [];
  for (const repo of data.repos) {
    try {
      await refreshRepo(repo.url);
      const updated = await readReposData();
      const r = getRepoByUrl(updated, repo.url);
      results.push({ url: repo.url, error: r?.error ?? null });
    } catch {
      results.push({ url: repo.url, error: "Refresh failed" });
    }
  }
  return results;
}

export interface RepoStatus {
  url: string;
  behind: number;
}

async function getBehindCount(repoPath: string): Promise<number> {
  let remoteRef = "origin/HEAD";
  for (const ref of ["origin/HEAD", "origin/main", "origin/master"]) {
    const proc = Bun.spawn(["git", "-C", repoPath, "rev-parse", ref], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const exit = await proc.exited;
    if (exit === 0) { remoteRef = ref; break; }
  }
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

export async function getReposStatus(): Promise<RepoStatus[]> {
  const data = await readReposData();
  const storeDir = getStoreDir();
  const results: RepoStatus[] = [];
  for (const repo of data.repos) {
    const repoPath = join(storeDir, repo.localPath);
    try {
      const fetchProc = Bun.spawn(["git", "-C", repoPath, "fetch", "origin"], {
        stdout: "ignore",
        stderr: "pipe",
      });
      await Promise.race([
        fetchProc.exited,
        new Promise<number>((_, rej) =>
          setTimeout(() => { fetchProc.kill(); rej(new Error("Fetch timed out")); }, FETCH_TIMEOUT_MS),
        ),
      ]);
    } catch {
      results.push({ url: repo.url, behind: 0 });
      continue;
    }
    try {
      const behind = await getBehindCount(repoPath);
      results.push({ url: repo.url, behind });
    } catch {
      results.push({ url: repo.url, behind: 0 });
    }
  }
  return results;
}

export async function ensureOfficialRepo(): Promise<void> {
  const data = await readReposData();
  if (data.repos.length > 0) return;
  const normalized = normalizeRepoUrl(OFFICIAL_REPO_URL);
  if (data.repos.some((r) => normalizeRepoUrl(r.url) === normalized)) return;
  try {
    await addRepo(OFFICIAL_REPO_URL);
  } catch {
    //
  }
}

export async function getRepos(): Promise<RepoInfo[]> {
  const data = await readReposData();
  if (data.repos.length === 0) {
    await ensureOfficialRepo();
    const after = await readReposData();
    return after.repos;
  }
  return data.repos;
}
