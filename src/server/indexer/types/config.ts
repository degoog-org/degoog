export interface IndexerConfig {
  maxPerSearch: number;
  maxUrls: number;
  maxHits: number;
  maxAgeDays: number;
  pruneEnabled: boolean;
  fuzzyEnabled: boolean;
  fuzzyMinTermRatio: number;
  queryLimit: number;
  domainAllowlist: Set<string>;
  domainBlocklist: Set<string>;
  wordBlocklist: string[];
}
