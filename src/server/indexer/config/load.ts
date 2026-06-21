import { asBoolean, asString } from "../../utils/plugin-settings";
import { getInstanceSettings } from "../../utils/server-settings";
import { readIndexerLists } from "./lists";
import type { IndexerConfig } from "../types/config";

let _cache: { settings: object; lists: object; cfg: IndexerConfig } | null = null;

const clampInt = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const n = parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const parseLines = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);

const parseDomains = (raw: string | undefined): Set<string> => {
  const set = new Set<string>();
  for (const line of parseLines(raw)) {
    set.add(line.replace(/^https?:\/\//, "").replace(/[/:?#].*$/, ""));
  }
  return set;
};

export const getIndexerConfig = async (): Promise<IndexerConfig> => {
  const s = await getInstanceSettings();
  const lists = await readIndexerLists();
  if (_cache && _cache.settings === s && _cache.lists === lists) return _cache.cfg;
  const maxPerSearch = clampInt(asString(s.degoogIndexerMaxPerSearch), 30, 0, 500);
  const maxUrls = clampInt(asString(s.degoogIndexerMaxUrls), 0, 0, 100_000_000);
  const maxHits = clampInt(asString(s.degoogIndexerMaxHits), 0, 0, 100_000_000);
  const maxAgeDays = clampInt(asString(s.degoogIndexerMaxAgeDays), 0, 0, 3650);
  const queryLimit = clampInt(asString(s.degoogIndexerQueryLimit), 100, 1, 500);
  const limitsOn = maxUrls > 0 || maxHits > 0;
  const pruneSetting = asString(s.degoogIndexerPruneEnabled);
  const pruneEnabled =
    limitsOn && (pruneSetting === "" || pruneSetting === "true" || asBoolean(s.degoogIndexerPruneEnabled));
  const fuzzyRaw = asString(s.degoogIndexerFuzzyEnabled);
  const ratioRaw = parseFloat(asString(s.degoogIndexerFuzzyMinTermRatio) || "0.6");
  const fuzzyMinTermRatio = Math.max(0, Math.min(1, Number.isFinite(ratioRaw) ? ratioRaw : 0.6));
  const cfg: IndexerConfig = {
    maxPerSearch,
    maxUrls,
    maxHits,
    maxAgeDays,
    pruneEnabled,
    fuzzyEnabled: fuzzyRaw !== "false",
    fuzzyMinTermRatio,
    queryLimit,
    domainAllowlist: parseDomains(lists.degoogIndexerDomainAllowlist),
    domainBlocklist: parseDomains(lists.degoogIndexerDomainBlocklist),
    wordBlocklist: parseLines(lists.degoogIndexerWordBlocklist),
  };
  _cache = { settings: s, lists, cfg };
  return cfg;
};
