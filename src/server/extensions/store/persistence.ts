import { mkdir, stat } from "fs/promises";
import { join } from "path";
import type { RepoInfo, ReposData } from "../../types/store";
import { writeJsonAtomic } from "../../utils/storage/atomic-json";
import { logger } from "../../utils/logger";
import { readJsonOrQuarantine } from "../../utils/storage/read-json";

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

async function ensureReposStructure(): Promise<void> {
  const storeDir = getStoreDir();
  await mkdir(storeDir, { recursive: true });
  const reposPath = getReposPath();
  try {
    await stat(reposPath);
  } catch (err) {
    logger.debug("store:persistence", "repos.json missing, creating initial file", err);
    const initial: ReposData = { repos: [], installed: [] };
    await writeJsonAtomic(reposPath, initial);
  }
}

export async function readReposData(): Promise<ReposData> {
  await ensureReposStructure();
  const obj = await readJsonOrQuarantine<unknown>(
    "store:persistence",
    getReposPath(),
  );
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { repos: [], installed: [] };
  }
  const parsed = obj as ReposData;
  if (!Array.isArray(parsed.repos)) parsed.repos = [];
  if (!Array.isArray(parsed.installed)) parsed.installed = [];
  return parsed;
}

export async function writeReposData(data: ReposData): Promise<void> {
  await ensureReposStructure();
  await writeJsonAtomic(getReposPath(), data);
}

export function getRepoByUrl(data: ReposData, url: string): RepoInfo | undefined {
  const normalized = normalizeRepoUrl(url);
  return data.repos.find((r) => normalizeRepoUrl(r.url) === normalized);
}
