import type { ScoredResult } from "../types";
import { signData, verifyData } from "./server-key";

export const buildSignedProxyUrl = (url: string): string => {
  const sig = signData(url);
  return `/api/proxy/image?url=${encodeURIComponent(url)}&sig=${sig}`;
};

export const verifyProxyUrl = (url: string, sig: string): boolean =>
  verifyData(url, sig);

export function signResultThumbnails(results: ScoredResult[]): ScoredResult[] {
  return results.map((r) => ({
    ...r,
    ...(r.thumbnail ? { thumbnail: buildSignedProxyUrl(r.thumbnail) } : {}),
    ...(r.imageUrl ? { imageUrl: buildSignedProxyUrl(r.imageUrl) } : {}),
  }));
}
