import { getBase } from "../utils/base-url";

const t = window.scopedT("core");

interface IndexerStats {
  totalResults: number;
  totalQueries: number;
  byType: Record<string, number>;
  dbSizeBytes: number;
}

const tr = (key: string, vars?: Record<string, string>): string =>
  t(`settings-page.indexer.${key}`, vars);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const renderStats = (wrap: HTMLElement, stats: IndexerStats): void => {
  wrap.replaceChildren();
  const rows: Array<[string, string]> = [
    [tr("total-results"), String(stats.totalResults)],
    [tr("total-queries"), String(stats.totalQueries)],
    [tr("db-size"), formatBytes(stats.dbSizeBytes)],
  ];
  for (const [label, value] of rows) {
    const cell = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    cell.append(dt, dd);
    wrap.append(cell);
  }
};

export const initIndexerPublic = async (): Promise<void> => {
  const section = document.getElementById("indexer-public-section");
  if (!section) return;

  let stats: IndexerStats | null = null;
  try {
    const res = await fetch(`${getBase()}/api/indexer/stats`);
    if (res.ok) stats = (await res.json()) as IndexerStats;
  } catch {
    stats = null;
  }
  if (!stats) {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  const statsWrap = document.getElementById("indexer-public-stats");
  if (statsWrap) renderStats(statsWrap, stats);

  const status = document.getElementById("indexer-public-status");
  document
    .getElementById("indexer-public-export-btn")
    ?.addEventListener("click", async () => {
      if (status) status.textContent = "";
      try {
        const res = await fetch(`${getBase()}/api/indexer/export`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (status) status.textContent = data.error ?? `Download failed (${res.status})`;
          return;
        }
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = "degoog-index.db";
        a.click();
        URL.revokeObjectURL(href);
      } catch {
        if (status) status.textContent = `Download failed`;
      }
    });
};
