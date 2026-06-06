import { getBase } from "../../utils/base-url";
import { authHeaders } from "../../utils/request";
import { getStoredToken } from "../../utils/settings-token";
import type { IndexerStats } from "../../types/indexer";

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const fetchStats = async (): Promise<IndexerStats | null> => {
  try {
    const res = await fetch(`${getBase()}/api/indexer/stats`, {
      headers: authHeaders(getStoredToken),
    });
    if (!res.ok) return null;
    return (await res.json()) as IndexerStats;
  } catch {
    return null;
  }
};

export const renderStats = (stats: IndexerStats): void => {
  const hitsEl = document.getElementById("indexer-stat-hits");
  const urlsEl = document.getElementById("indexer-stat-urls");
  const queriesEl = document.getElementById("indexer-stat-queries");
  const sizeEl = document.getElementById("indexer-stat-size");
  const hits = stats.totalHits ?? stats.totalResults;
  if (hitsEl) hitsEl.textContent = String(hits);
  if (urlsEl) urlsEl.textContent = String(stats.totalUrls ?? 0);
  if (queriesEl) queriesEl.textContent = String(stats.totalQueries);
  if (sizeEl) sizeEl.textContent = formatBytes(stats.dbSizeBytes);

  const byTypeEl = document.getElementById("indexer-by-type");
  if (byTypeEl) {
    byTypeEl.replaceChildren();
    for (const [type, count] of Object.entries(stats.byType)) {
      const cell = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = type;
      const dd = document.createElement("dd");
      dd.textContent = String(count);
      cell.append(dt, dd);
      byTypeEl.append(cell);
    }
  }
};

export const setActionStatus = (text: string): void => {
  const el = document.getElementById("indexer-action-status");
  if (el) el.textContent = text;
};
