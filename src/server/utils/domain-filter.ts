import type { ScoredResult } from "../types";
import { getSettings, asString } from "./plugin-settings";

const DEGOOG_SETTINGS_ID = "degoog-settings";

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

export const filterBlockedDomains = async (
  results: ScoredResult[],
): Promise<ScoredResult[]> => {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  if (asString(settings.domainBlockEnabled) !== "true") return results;

  const patterns = _parseBlockList(asString(settings.domainBlockList));
  if (patterns.length === 0) return results;

  return results.filter((result) => {
    try {
      const hostname = new URL(result.url).hostname;
      return !patterns.some((pattern) => _matchesDomain(hostname, pattern));
    } catch {
      return true;
    }
  });
};

export const applyDomainReplacements = async (
  results: ScoredResult[],
): Promise<ScoredResult[]> => {
  const settings = await getSettings(DEGOOG_SETTINGS_ID);
  if (asString(settings.domainReplaceEnabled) !== "true") return results;

  const rules = _parseReplaceList(asString(settings.domainReplaceList));
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
    } catch {
      return result;
    }
  });
};
