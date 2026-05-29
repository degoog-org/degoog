import type { SearchResult } from "../types";
import type { IndexerConfig } from "./config";

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const matchesDomain = (host: string, list: string[]): boolean =>
  list.some((d) => host === d || host.endsWith(`.${d}`));

const hasBlockedWord = (result: SearchResult, words: string[]): boolean => {
  if (words.length === 0) return false;
  const haystack = `${result.title ?? ""} ${result.snippet ?? ""} ${result.url ?? ""}`.toLowerCase();
  return words.some((w) => haystack.includes(w));
};

export const shouldIndex = (
  result: SearchResult,
  cfg: IndexerConfig,
): boolean => {
  const host = hostOf(result.url);
  if (cfg.domainBlocklist.length > 0) {
    if (!host) return false;
    if (matchesDomain(host, cfg.domainBlocklist)) return false;
  }
  if (cfg.domainAllowlist.length > 0) {
    if (!host) return false;
    if (!matchesDomain(host, cfg.domainAllowlist)) return false;
  }
  if (hasBlockedWord(result, cfg.wordBlocklist)) return false;
  return true;
};
