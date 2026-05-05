import type { ExtensionStoreType } from "./extension";

export interface RepoInfo {
  url: string;
  localPath: string;
  addedAt: string;
  lastFetched: string;
  name: string;
  description: string;
  error: string | null;
  repoImage?: string | null;
}

export interface StoreItem {
  repoUrl: string;
  repoSlug: string;
  repoName: string;
  type: ExtensionStoreType;
  path: string;
  name: string;
  description: string;
  version: string;
  author: {
    name: string;
    url?: string;
    avatar?: string;
  } | null;
  screenshots: string[];
  installed: boolean;
  installedVersion?: string;
  updateAvailable?: boolean;
  pluginType?: string;
  engineType?: string;
  minDegoogVersion?: string;
  requiresNewerVersion?: boolean;
}

export interface InstalledItem {
  repoUrl: string;
  type: ExtensionStoreType;
  itemPath: string;
  installedAs: string;
  installedAt: string;
  version: string;
  minDegoogVersion?: string;
}

export interface ReposData {
  repos: RepoInfo[];
  installed: InstalledItem[];
}

export interface RepoPackageJson {
  name?: string;
  description?: string;
  author?: string;
  plugins?: Array<{
    path: string;
    name: string;
    description?: string;
    version?: string;
    type?: string;
    dependencies?: string[];
    minDegoogVersion?: string;
  }>;
  themes?: Array<{
    path: string;
    name: string;
    description?: string;
    version?: string;
    dependencies?: string[];
    minDegoogVersion?: string;
  }>;
  engines?: Array<{
    path: string;
    name: string;
    description?: string;
    version?: string;
    type?: string;
    dependencies?: string[];
    minDegoogVersion?: string;
  }>;
  transports?: Array<{
    path: string;
    name: string;
    description?: string;
    version?: string;
    dependencies?: string[];
    minDegoogVersion?: string;
  }>;
  "repo-image"?: string;
}

export interface AuthorJson {
  name: string;
  url?: string;
  avatar?: string;
}

export interface RepoStatus {
  url: string;
  behind: number;
}
