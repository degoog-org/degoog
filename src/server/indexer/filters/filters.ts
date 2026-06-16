import type { SearchResult } from "../../types";
import type { IndexerConfig } from "../types/config";
import { logger } from "../../utils/logger";

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (err) {
    logger.debug("indexer", `invalid result URL "${url}"`, err);
    return null;
  }
};

const matchesDomain = (host: string, list: Set<string>): boolean => {
  if (list.has(host)) return true;
  let idx = host.indexOf(".");
  while (idx !== -1) {
    if (list.has(host.slice(idx + 1))) return true;
    idx = host.indexOf(".", idx + 1);
  }
  return false;
};

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
  if (cfg.domainBlocklist.size > 0) {
    if (!host) return false;
    if (matchesDomain(host, cfg.domainBlocklist)) return false;
  }
  if (cfg.domainAllowlist.size > 0) {
    if (!host) return false;
    if (!matchesDomain(host, cfg.domainAllowlist)) return false;
  }
  if (hasBlockedWord(result, cfg.wordBlocklist)) return false;
  return true;
};
