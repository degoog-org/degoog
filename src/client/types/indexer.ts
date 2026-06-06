export interface IndexerStats {
  totalResults: number;
  totalHits?: number;
  totalUrls?: number;
  totalQueries: number;
  byType: Record<string, number>;
  dbSizeBytes: number;
  backend?: "sqlite" | "postgres";
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

export interface RowsResponse {
  rows: HitRow[];
  total: number;
  page: number;
  limit: number;
}

export interface DeleteItem {
  id: number;
  engine_type: string;
}
