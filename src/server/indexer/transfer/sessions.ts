import type { FileSink } from "bun";
import { mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { logger } from "../../utils/logger";
import { indexerTmpDir } from "../../utils/paths";

const SESSION_TTL_MS = 30 * 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;

export interface ExportSession {
  path: string;
  size: number;
  cleanup: boolean;
  type: string;
  expires: number;
}

export interface ImportSession {
  path: string;
  sink: FileSink;
  type: string;
  received: number;
  expires: number;
}

const _exports = new Map<string, ExportSession>();
const _imports = new Map<string, ImportSession>();
let _sweepTimer: ReturnType<typeof setInterval> | null = null;

const newId = (): string => randomBytes(16).toString("hex");

const tempPath = (kind: string): string => {
  const dir = indexerTmpDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, `degoog-${kind}-${randomBytes(8).toString("hex")}.db`);
};

const bin = (path: string): void => {
  try {
    unlinkSync(path);
  } catch {
    // best-effort cleanup
  }
};

const sweep = (): void => {
  const now = Date.now();
  for (const [id, s] of _exports) {
    if (s.expires <= now) {
      if (s.cleanup) bin(s.path);
      _exports.delete(id);
    }
  }
  for (const [id, s] of _imports) {
    if (s.expires <= now) {
      void s.sink.end();
      bin(s.path);
      _imports.delete(id);
    }
  }
};

const startSweep = (): void => {
  if (_sweepTimer) return;
  _sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  _sweepTimer.unref?.();
};

const getLiveExport = (id: string): ExportSession | undefined => {
  const s = _exports.get(id);
  if (!s) return undefined;
  if (s.expires <= Date.now()) {
    if (s.cleanup) bin(s.path);
    _exports.delete(id);
    return undefined;
  }
  return s;
};

const getLiveImport = (id: string): ImportSession | undefined => {
  const s = _imports.get(id);
  if (!s) return undefined;
  if (s.expires <= Date.now()) {
    void s.sink.end();
    bin(s.path);
    _imports.delete(id);
    return undefined;
  }
  return s;
};

export const openExportSession = (
  path: string,
  size: number,
  cleanup: boolean,
  type: string,
): string => {
  startSweep();
  sweep();
  const id = newId();
  _exports.set(id, { path, size, cleanup, type, expires: Date.now() + SESSION_TTL_MS });
  return id;
};

export const getExportSession = (id: string): ExportSession | undefined =>
  getLiveExport(id);

export const closeExportSession = (id: string): void => {
  const s = getLiveExport(id);
  if (!s) return;
  if (s.cleanup) bin(s.path);
  _exports.delete(id);
  logger.debug("indexer", `export session closed id=${id.slice(0, 8)}`);
};

export const openImportSession = (type: string): { id: string; path: string } => {
  startSweep();
  sweep();
  const id = newId();
  const path = tempPath("import");
  const sink = Bun.file(path).writer();
  _imports.set(id, { path, sink, type, received: 0, expires: Date.now() + SESSION_TTL_MS });
  return { id, path };
};

export const getImportSession = (id: string): ImportSession | undefined =>
  getLiveImport(id);

export const appendImportChunk = async (
  id: string,
  chunk: ArrayBuffer,
): Promise<number | null> => {
  const s = getLiveImport(id);
  if (!s) return null;
  s.sink.write(new Uint8Array(chunk));
  await s.sink.flush();
  s.received += chunk.byteLength;
  s.expires = Date.now() + SESSION_TTL_MS;
  return s.received;
};

export const finishImportSession = async (id: string): Promise<string | null> => {
  const s = getLiveImport(id);
  if (!s) return null;
  await s.sink.end();
  return s.path;
};

export const removeImportSession = (id: string): void => {
  const s = getLiveImport(id);
  if (!s) return;
  bin(s.path);
  _imports.delete(id);
};

export const dropImportSession = (id: string): void => {
  const s = getLiveImport(id);
  if (!s) return;
  void s.sink.end();
  bin(s.path);
  _imports.delete(id);
  logger.debug("indexer", `import session dropped id=${id.slice(0, 8)}`);
};
