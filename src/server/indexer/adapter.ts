import type { IndexRow } from "./recorders";
import type { IndexerConfig } from "./config";

export interface ExportRow {
  query_norm: string;
  engine_type: string;
  url: string;
  url_norm: string;
  source_engine: string;
  title: string;
  snippet: string;
  thumbnail: string | null;
  image_url: string | null;
  is_gif: number | null;
  duration: string | null;
  extras_json: string | null;
  first_seen: number;
  last_seen: number;
  source_instance: string | null;
}

export interface UrlRow {
  url: string;
  source_engine: string;
  title: string;
  snippet: string;
  thumbnail: string | null;
  image_url: string | null;
  is_gif: number | null;
  duration: string | null;
  extras_json: string | null;
}

export interface HitRow {
  id: number;
  query_norm: string;
  engine_type: string;
  url: string;
  title: string;
  snippet: string;
  last_seen: number;
}

export interface TypeCounts {
  hits: number;
  urls: number;
  queries: number;
}

export interface IndexerAdapter {
  boot(): Promise<void>;
  open(type: string): Promise<void>;
  discoverTypes(): string[];
  close(): Promise<void>;
  checkpoint(type: string): Promise<void>;

  writeBatch(type: string, rows: IndexRow[], now: number): Promise<void>;
  importRows(type: string, rows: ExportRow[]): Promise<{ urls: number; hits: number }>;

  queryExact(type: string, queryNorm: string, limit: number): Promise<UrlRow[]>;
  queryFuzzy(type: string, queryNorm: string, limit: number): Promise<UrlRow[]>;

  getTypeCounts(type: string): Promise<TypeCounts>;
  totalDbSize(types: string[]): Promise<number>;

  listHitsForType(type: string, q: string | undefined, limit: number, offset: number): Promise<HitRow[]>;
  countHitsForType(type: string, q: string | undefined): Promise<number>;
  sampleRows(type: string, limit: number): Promise<ExportRow[]>;
  exportRows(type: string): Promise<ExportRow[]>;

  deleteHitsForType(type: string, ids: number[]): Promise<void>;
  clearType(type: string): Promise<void>;
  pruneType(type: string, cfg: IndexerConfig): Promise<void>;
}
