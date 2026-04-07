import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import type { RepoInfo, ReposData } from "../../types";

function getDataDir(): string {
  return process.env.DEGOOG_DATA_DIR ?? join(process.cwd(), "data");
}

export function getReposPath(): string {
  return join(getDataDir(), "repos.json");
}

export function getStoreDir(): string {
  return join(getDataDir(), "store");
}

export function normalizeRepoUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.endsWith(".git")) return trimmed;
  return trimmed + (trimmed.includes("?") || trimmed.includes("#") ? "" : ".git");
}

export async function ensureReposStructure(): Promise<void> {
  const storeDir = getStoreDir();
  await mkdir(storeDir, { recursive: true });
  const reposPath = getReposPath();
  try {
    await readFile(reposPath, "utf-8");
  } catch {
    const initial: ReposData = { repos: [], installed: [] };
    await mkdir(dirname(reposPath), { recursive: true });
    await writeFile(reposPath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

export async function readReposData(): Promise<ReposData> {
  await ensureReposStructure();
  const raw = await readFile(getReposPath(), "utf-8");
  let parsed: ReposData;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      parsed = { repos: [], installed: [] };
    } else {
      parsed = obj as ReposData;
      if (!Array.isArray(parsed.repos)) parsed.repos = [];
      if (!Array.isArray(parsed.installed)) parsed.installed = [];
    }
  } catch {
    parsed = { repos: [], installed: [] };
  }
  return parsed;
}

export async function writeReposData(data: ReposData): Promise<void> {
  await ensureReposStructure();
  await writeFile(getReposPath(), JSON.stringify(data, null, 2), "utf-8");
}

export function getRepoByUrl(data: ReposData, url: string): RepoInfo | undefined {
  const normalized = normalizeRepoUrl(url);
  return data.repos.find((r) => normalizeRepoUrl(r.url) === normalized);
}
