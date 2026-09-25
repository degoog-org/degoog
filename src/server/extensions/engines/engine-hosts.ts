import { readFile } from "fs/promises";
import { engineHostsFile } from "../../utils/paths";
import { writeJsonAtomic } from "../../utils/storage/atomic-json";
import { logger } from "../../utils/logger";

const NS = "engine-hosts";

const FLUSH_DELAY_MS = 5_000;
const MAX_HOST_CHARS = 253;

const HOST_SHAPE = /^[a-zA-Z0-9.-]+$/;

let _hosts: Map<string, string> | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

const _sane = (host: string): boolean =>
  HOST_SHAPE.test(host) && host.includes(".") && host.length <= MAX_HOST_CHARS;

const _load = async (): Promise<Map<string, string>> => {
  if (_hosts) return _hosts;
  const loaded = new Map<string, string>();
  try {
    const parsed: unknown = JSON.parse(await readFile(engineHostsFile(), "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [id, host] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof host === "string" && _sane(host)) loaded.set(id, host);
      }
    }
  } catch (err) {
    logger.debug(NS, "no engine host memory on disk yet", err);
  }
  _hosts = loaded;
  return loaded;
};

export const primeEngineHosts = async (): Promise<void> => {
  const pending = _hosts;
  _hosts = null;
  const loaded = await _load();
  if (!pending) return;
  let recovered = false;
  for (const [id, host] of pending) {
    if (loaded.has(id)) continue;
    loaded.set(id, host);
    recovered = true;
  }
  if (recovered) _scheduleFlush();
};

export const engineHost = (engineId: string): string | undefined =>
  _hosts?.get(engineId);

const _flush = async (): Promise<void> => {
  _flushTimer = null;
  if (!_hosts) return;
  try {
    await writeJsonAtomic(engineHostsFile(), Object.fromEntries(_hosts));
  } catch (err) {
    logger.warn(NS, "could not remember which host each engine talks to", err);
  }
};

export const flushHosts = async (): Promise<void> => {
  if (_flushTimer) clearTimeout(_flushTimer);
  await _flush();
};

const _scheduleFlush = (): void => {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => void _flush(), FLUSH_DELAY_MS);
  _flushTimer.unref?.();
};

const _remember = async (engineId: string, host: string): Promise<void> => {
  const hosts = await _load();
  if (hosts.has(engineId)) return;
  hosts.set(engineId, host);
  logger.debug(NS, `engine "${engineId}" talks to ${host}`);
  _scheduleFlush();
};

export const noteEngineHost = (engineId: string | undefined, url: string): void => {
  if (!engineId || _hosts?.has(engineId)) return;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch (err) {
    logger.debug(NS, `engine "${engineId}" fetched something that is not a url`, err);
    return;
  }
  if (!_sane(host)) return;
  void _remember(engineId, host);
};
