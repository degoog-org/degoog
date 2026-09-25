import type { ScoredResult } from "../../../shared/search-types";
import type { AutocompleteCacheItem } from "../cache/cache";
import { signData, verifyData } from "../security/server-key";
import { getBasePath, getBaseUrl } from "./base-url";

const PROXY_PREFIX = "/api/proxy/";

const _isOwnProxyUrl = (thumb: string): boolean => {
  if (thumb.startsWith(`${getBasePath()}${PROXY_PREFIX}`)) return true;
  const baseUrl = getBaseUrl();
  return /^https?:\/\//i.test(baseUrl) && thumb.startsWith(`${baseUrl}${PROXY_PREFIX}`);
};

const _signThumb = (thumb: string | undefined): string | undefined =>
  thumb && !_isOwnProxyUrl(thumb) ? buildSignedProxyUrl(thumb) : thumb;

export const buildSignedProxyUrl = (url: string): string => {
  const sig = signData(url);
  return `${getBasePath()}/api/proxy/image?url=${encodeURIComponent(url)}&sig=${sig}`;
};

export const verifyProxyUrl = (url: string, sig: string): boolean =>
  verifyData(url, sig);

export function signResultThumbnails(results: ScoredResult[]): ScoredResult[] {
  return results.map((r) => ({
    ...r,
    ...(r.thumbnail ? { thumbnail: _signThumb(r.thumbnail) } : {}),
    ...(r.imageUrl ? { imageUrl: _signThumb(r.imageUrl) } : {}),
  }));
}

export const signSuggestionThumbnails = (
  items: AutocompleteCacheItem[],
): AutocompleteCacheItem[] =>
  items.map((item) =>
    item.rich?.thumbnail
      ? { ...item, rich: { ...item.rich, thumbnail: _signThumb(item.rich.thumbnail) } }
      : item,
  );
