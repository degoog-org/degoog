import { getBase } from "../../utils/base-url";

export const downloadIndexerExport = async (
  type: string,
  opts?: {
    headers?: Record<string, string>;
    onStatus?: (text: string) => void;
    statusEl?: HTMLElement | null;
  },
): Promise<void> => {
  const setStatus = (text: string): void => {
    if (opts?.onStatus) opts.onStatus(text);
    if (opts?.statusEl) opts.statusEl.textContent = text;
  };

  setStatus("");
  try {
    const res = await fetch(
      `${getBase()}/api/indexer/export?type=${encodeURIComponent(type)}`,
      { headers: opts?.headers },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus(data.error ?? `Download failed (${res.status})`);
      return;
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `degoog-index-${type}.db`;
    a.click();
    URL.revokeObjectURL(href);
  } catch {
    setStatus("Download failed");
  }
};
