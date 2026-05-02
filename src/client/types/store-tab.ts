export interface RepoInfo {
  url: string;
  localPath: string;
  lastFetched: string;
  name: string;
  error?: string;
  repoImage?: string | null;
}

export interface StoreItem {
  path: string;
  repoSlug: string;
  repoUrl: string;
  repoName: string;
  name: string;
  description?: string;
  version: string;
  type: "plugin" | "theme" | "engine" | "transport";
  installed: boolean;
  installedVersion?: string;
  updateAvailable?: boolean;
  screenshots: string[];
  author?: { name: string; url?: string };
  pluginType?: string;
  engineType?: string;
  requiresNewerVersion?: boolean;
}
