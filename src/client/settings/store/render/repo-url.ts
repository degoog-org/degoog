import { getBase } from "../../../utils/net/base-url";
import type { RepoInfo } from "../../../types/store-tab";

export function normalizeRepoUrl(url: string): string {
  const normUrl = (url || "").trim();
  return normUrl.endsWith(".git")
    ? normUrl
    : normUrl + (normUrl.includes("?") || normUrl.includes("#") ? "" : ".git");
}

export function repoImageSrc(repo: RepoInfo): string {
  const img = repo.repoImage;
  if (!img) return "";
  if (img.startsWith(`${getBase()}/api/proxy/`)) return img;
  if (/^[a-z][a-z0-9+.-]*:/i.test(img) || img.startsWith("//")) return "";
  return `${getBase()}/api/store/repos/${encodeURIComponent(repo.localPath)}/asset?path=${encodeURIComponent(img)}`;
}
