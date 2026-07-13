import { getBase } from "../../utils/base-url";

const CHUNK_BYTES = 8 * 1024 * 1024;

interface StartResponse {
  sessionId?: string;
  size?: number;
  error?: string;
}

interface ChunkWriter {
  write: (bytes: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
}

export interface DownloadOpts {
  headers?: Record<string, string>;
  onStatus?: (text: string) => void;
  onProgress?: (done: number, total: number) => void;
}

const saveBlob = (parts: BlobPart[], filename: string): void => {
  const href = URL.createObjectURL(new Blob(parts, { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
};

const openWriter = async (filename: string): Promise<ChunkWriter | null> => {
  const picker = (
    window as unknown as { showSaveFilePicker?: (opts: unknown) => Promise<unknown> }
  ).showSaveFilePicker;

  if (typeof picker === "function") {
    try {
      const handle = (await picker({ suggestedName: filename })) as {
        createWritable: () => Promise<{
          write: (b: Uint8Array) => Promise<void>;
          close: () => Promise<void>;
          abort?: () => Promise<void>;
        }>;
      };
      const stream = await handle.createWritable();
      return {
        write: (bytes) => stream.write(bytes),
        close: () => stream.close(),
        abort: () => stream.abort?.() ?? Promise.resolve(),
      };
    } catch {
      return null;
    }
  }

  const parts: BlobPart[] = [];
  return {
    write: async (bytes) => {
      parts.push(bytes.slice().buffer);
    },
    close: async () => {
      saveBlob(parts, filename);
    },
    abort: async () => {
      parts.length = 0;
    },
  };
};

export const downloadIndexerExport = async (
  type: string,
  opts?: DownloadOpts,
): Promise<void> => {
  const setStatus = (text: string): void => opts?.onStatus?.(text);
  const base = getBase();
  const headers = opts?.headers ?? {};

  setStatus("");
  try {
    const startRes = await fetch(`${base}/api/indexer/export/start`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    const start = (await startRes.json().catch(() => ({}))) as StartResponse;
    if (!startRes.ok || !start.sessionId || typeof start.size !== "number") {
      setStatus(start.error ?? `Export failed (${startRes.status})`);
      return;
    }

    const { sessionId, size } = start;
    const filename = `degoog-index-${type}.db`;
    try {
      const writer = await openWriter(filename);
      if (!writer) return;

      let done = 0;
      for (let pos = 0; pos < size; pos += CHUNK_BYTES) {
        const end = Math.min(size, pos + CHUNK_BYTES);
        const expected = end - pos;
        const res = await fetch(
          `${base}/api/indexer/export/chunk?session=${encodeURIComponent(sessionId)}&start=${pos}&end=${end}`,
          { headers },
        );
        if (!res.ok) {
          setStatus(`Export failed (${res.status})`);
          await writer.abort();
          return;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength !== expected) {
          setStatus("Export failed (incomplete chunk)");
          await writer.abort();
          return;
        }
        await writer.write(bytes);
        done += bytes.byteLength;
        opts?.onProgress?.(done, size);
      }
      await writer.close();
    } finally {
      await fetch(`${base}/api/indexer/export/end`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ session: sessionId }),
      }).catch(() => undefined);
    }
  } catch {
    setStatus("Download failed");
  }
};
