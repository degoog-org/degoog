import type { ScoredResult } from "../types";
import { asBoolean } from "./plugin-settings";
import { getInstanceSettings } from "./server-settings";
import { readDomainLists } from "./domain-lists";
import { INVALIDATE_SCOPE, onInvalidate } from "./cache-valkey";
import { logger } from "./logger";

interface ParsedLists {
  block: string[];
  replace: { source: string; target: string }[];
  score: { pattern: string; score: number }[];
}

let _parsed: ParsedLists | null = null;

onInvalidate((payload) => {
  if (payload.scope !== INVALIDATE_SCOPE.SERVER_SETTINGS) return;
  _parsed = null;
});

const _matchesDomain = (hostname: string, pattern: string): boolean => {
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    const regex = new RegExp(pattern.slice(1, -1));
    return regex.test(hostname);
  }
  return hostname === pattern || hostname.endsWith(`.${pattern}`);
};

const _parseBlockList = (raw: string): string[] =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const _parseReplaceList = (
  raw: string,
): { source: string; target: string }[] =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("->"))
    .map((line) => {
      const [source, target] = line.split("->").map((s) => s.trim());
      return { source, target };
    });

const _parseScoreList = (raw: string): { pattern: string; score: number }[] =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|"))
    .map((line) => {
      const [pattern, scoreRaw] = line.split("|").map((s) => s.trim());
      const score = Number(scoreRaw);
      return { pattern, score };
    })
    .filter((entry) => entry.pattern.length > 0 && Number.isFinite(entry.score));

const getParsed = async (): Promise<ParsedLists> => {
  if (_parsed) return _parsed;
  const lists = await readDomainLists();
  _parsed = {
    block: _parseBlockList(lists.domainBlockList),
    replace: _parseReplaceList(lists.domainReplaceList),
    score: _parseScoreList(lists.domainScoreList),
  };
  return _parsed;
};

export const filterBlockedDomains = async (
  results: ScoredResult[],
): Promise<ScoredResult[]> => {
  const settings = await getInstanceSettings();
  if (!asBoolean(settings.domainBlockEnabled)) return results;

  const patterns = (await getParsed()).block;
  if (patterns.length === 0) return results;

  return results.filter((result) => {
    try {
      const hostname = new URL(result.url).hostname;
      return !patterns.some((pattern) => _matchesDomain(hostname, pattern));
    } catch (err) {
      logger.debug("domain-filter", `invalid result URL "${result.url}"`, err);
      return true;
    }
  });
};

export const applyDomainReplacements = async (
  results: ScoredResult[],
): Promise<ScoredResult[]> => {
  const settings = await getInstanceSettings();
  if (!asBoolean(settings.domainReplaceEnabled)) return results;

  const rules = (await getParsed()).replace;
  if (rules.length === 0) return results;

  return results.map((result) => {
    try {
      const url = new URL(result.url);
      for (const rule of rules) {
        if (_matchesDomain(url.hostname, rule.source)) {
          url.hostname = rule.target;
          return { ...result, url: url.toString() };
        }
      }
      return result;
    } catch (err) {
      logger.debug("domain-filter", `domain replace skipped for "${result.url}"`, err);
      return result;
    }
  });
};

export const applyDomainScores = async (
  results: ScoredResult[],
): Promise<ScoredResult[]> => {
  const settings = await getInstanceSettings();
  if (!asBoolean(settings.domainScoreEnabled)) return results;

  const entries = (await getParsed()).score;
  if (entries.length === 0) return results;

  const adjusted = results.map((result) => {
    try {
      const hostname = new URL(result.url).hostname;
      const boost = entries
        .filter((entry) => _matchesDomain(hostname, entry.pattern))
        .reduce((sum, entry) => sum + entry.score, 0);
      if (boost === 0) return result;
      return { ...result, score: result.score + boost };
    } catch (err) {
      logger.debug("domain-filter", `domain score skipped for "${result.url}"`, err);
      return result;
    }
  });

  return adjusted.sort((a, b) => b.score - a.score);
};
