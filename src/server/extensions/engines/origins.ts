import { ExtensionStoreType } from "../../types/extension";
import type { RepoInfo } from "../../types/store";
import {
  COMPAT_LAYER_LABELS,
  type CompatLayerId,
} from "../../../shared/compat-layers";
import {
  COMPAT_ORIGIN_ICONS,
  CORE_ORIGIN_ICON,
  CORE_ORIGIN_LABEL,
  EngineOriginKind,
  STORE_ORIGIN_GLYPH,
  type EngineOrigin,
} from "../../../shared/engine-origins";
import { normalizeRepoUrl, readReposData } from "../store/persistence";
import { folderFromExtID } from "../../utils/extension-support/extension-id";
import { getBasePath } from "../../utils/net/base-url";
import { buildSignedProxyUrl } from "../../utils/net/proxy-sign";
import { logger } from "../../utils/logger";
import { engineHost } from "./engine-hosts";

const NS = "engine-origins";

type OriginMap = ReadonlyMap<string, EngineOrigin>;

const _asset = (path: string): string => `${getBasePath()}${path}`;

const _coreOrigin = (): EngineOrigin => ({
  kind: EngineOriginKind.Core,
  label: CORE_ORIGIN_LABEL,
  icon: _asset(CORE_ORIGIN_ICON),
});

const _storeOrigin = (repo: RepoInfo): EngineOrigin => {
  const base = { kind: EngineOriginKind.Store, label: repo.name };
  const image = repo.repoImage ?? "";
  if (/^https?:\/\//i.test(image)) {
    return { ...base, icon: buildSignedProxyUrl(image) };
  }
  return { ...base, glyph: STORE_ORIGIN_GLYPH };
};

const _hostOf = (site: string): string | undefined => {
  try {
    return new URL(site).hostname || undefined;
  } catch (err) {
    logger.debug(NS, `engine site "${site}" is not a usable url`, err);
    return undefined;
  }
};

const _faviconFor = (entry: { id: string; site?: string }): string | undefined => {
  const host = entry.site ? _hostOf(entry.site) : engineHost(entry.id);
  if (!host) return undefined;
  return `${getBasePath()}/api/proxy/favicon?domain=${encodeURIComponent(host)}`;
};

const _urlOf = (record: unknown, field: string): string | null => {
  if (!record || typeof record !== "object") return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
};

export const storeOrigins = async (): Promise<OriginMap> => {
  const origins = new Map<string, EngineOrigin>();
  try {
    const data = await readReposData();
    const repos = new Map<string, RepoInfo>();
    for (const repo of data.repos) {
      const url = _urlOf(repo, "url");
      if (!url) {
        logger.warn(NS, "skipping a repos.json entry with no usable url");
        continue;
      }
      repos.set(normalizeRepoUrl(url), repo);
    }
    for (const item of data.installed) {
      if (!item || typeof item !== "object") continue;
      if (item.type !== ExtensionStoreType.Engine) continue;
      const repoUrl = _urlOf(item, "repoUrl");
      if (!repoUrl || typeof item.installedAs !== "string") {
        logger.warn(NS, "skipping an installed entry with no usable repoUrl or name");
        continue;
      }
      const repo = repos.get(normalizeRepoUrl(repoUrl));
      if (!repo) continue;
      origins.set(item.installedAs, _storeOrigin(repo));
    }
  } catch (err) {
    logger.warn(NS, "could not read store origins from repos.json", err);
  }
  return origins;
};

export const engineOrigin = (
  entry: { id: string; compatibilityLayer?: string; site?: string },
  origins: OriginMap,
): EngineOrigin => {
  const favicon = _faviconFor(entry);
  const layer = entry.compatibilityLayer as CompatLayerId | undefined;
  if (layer && COMPAT_ORIGIN_ICONS[layer]) {
    return {
      kind: EngineOriginKind.Compat,
      label: COMPAT_LAYER_LABELS[layer],
      icon: _asset(COMPAT_ORIGIN_ICONS[layer]),
      favicon,
    };
  }
  const folder = folderFromExtID(entry.id, "engine");
  const provenance =
    origins.get(folder) ?? origins.get(entry.id) ?? _coreOrigin();
  return favicon ? { ...provenance, favicon } : provenance;
};
