import type { ScoredResult } from "../types";
import { asBoolean } from "./plugin-settings";
import { getInstanceSettings } from "./server-settings";
import { readDomainLists } from "./domain-lists";
import { INVALIDATE_SCOPE, onInvalidate } from "./cache-valkey";
import { isUboFilterLine, uboLineToDomain } from "./ubo-filter";
import { logger } from "./logger";

interface BlockPatterns {
  exact: Set<string>;
  regex: RegExp[];
}

interface ParsedLists {
  block: BlockPatterns;
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

const _isRegexPattern = (line: string): boolean =>
  line.length > 2 && line.startsWith("/") && line.endsWith("/");

/**everything is resolved once at parse time*/
const _parseBlockList = (raw: string): BlockPatterns => {
  const exact = new Set<string>();
  const regex: RegExp[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    if (isUboFilterLine(trimmed)) {
      const domain = uboLineToDomain(trimmed);
      if (domain) exact.add(domain);
      continue;
    }

    if (_isRegexPattern(trimmed)) {
      try {
        regex.push(new RegExp(trimmed.slice(1, -1)));
      } catch (err) {
        logger.debug("domain-filter", `invalid block regex "${trimmed}"`, err);
      }
      continue;
    }

    exact.add(trimmed.toLowerCase());
  }

  return { exact, regex };
};

const _matchesBlock = (hostname: string, patterns: BlockPatterns): boolean => {
  let candidate = hostname;
  for (;;) {
    if (patterns.exact.has(candidate)) return true;
    const dot = candidate.indexOf(".");
    if (dot === -1) break;
    candidate = candidate.slice(dot + 1);
  }
  return patterns.regex.some((re) => re.test(hostname));
};

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
  if (patterns.exact.size === 0 && patterns.regex.length === 0) return results;

  return results.filter((result) => {
    try {
      const hostname = new URL(result.url).hostname;
      return !_matchesBlock(hostname, patterns);
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
