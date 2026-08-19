import { mkdir, readdir, rename, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { randomBytes } from "crypto";
import { join, resolve } from "path";
import { logger } from "../../../utils/logger";
import {
  SEARX_CATALOG,
  SEARX_SOURCE_BASE_URL,
  SEARX_TRAITS_URL,
  catalogDeps,
  catalogEntry,
  dependants,
  engineLibs,
  isSupportFile,
} from "./catalog";
import type { SearxCatalogItem, SearxLibStatus } from "./catalog-types";
import { searxEnginesDir } from "./paths";
import { LIB_PACKAGES, missingPythonLibs, type PythonLib } from "./python-deps";

const NS = "searx-install";
const PYCACHE_DIR = "__pycache__";
const DOWNLOAD_TIMEOUT_MS = 20_000;
const TRAITS_SUFFIX = ".traits.json";
const SHORTEST_ALIAS = 4;

let _queue: Promise<unknown> = Promise.resolve();

export const withSearxLock = <T>(task: () => Promise<T>): Promise<T> => {
  const run = _queue.then(task, task);
  _queue = run.catch(() => undefined);
  return run;
};

const _enginePath = (code: string): string => join(resolve(searxEnginesDir()), `${code}.py`);

const _isInstalled = (code: string): boolean => existsSync(_enginePath(code));

const _known = (code: string): string => {
  const entry = catalogEntry(code);
  if (!entry) throw new Error(`Unknown SearX engine "${code}"`);
  return entry.code;
};

const _dropCache = async (code: string): Promise<void> => {
  const dir = join(resolve(searxEnginesDir()), PYCACHE_DIR);
  try {
    const names = await readdir(dir);
    const stale = names.filter((name) => name.startsWith(`${code}.cpython-`));
    await Promise.all(stale.map((name) => unlink(join(dir, name))));
  } catch (err) {
    logger.debug(NS, `no bytecode cache to clear for ${code}`, err);
  }
};

const _download = async (code: string): Promise<string> => {
  const url = `${SEARX_SOURCE_BASE_URL}/${code}.py`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Download failed with HTTP ${resp.status}`);
  const source = await resp.text();
  if (!source.trim()) throw new Error("Downloaded engine file was empty");
  return source;
};

const _missingDeps = (code: string): string[] =>
  catalogDeps(code).filter((dep) => !_isInstalled(dep));

const _writeSwap = async (target: string, body: string): Promise<void> => {
  const tmp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await mkdir(resolve(searxEnginesDir()), { recursive: true });
    await writeFile(tmp, body, "utf-8");
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
};

const _fetchFile = async (code: string, dir: string): Promise<void> => {
  const source = await _download(code);
  await mkdir(dir, { recursive: true });
  await _writeSwap(_enginePath(code), source);
  await _dropCache(code);
};

const _traitsPath = (code: string): string =>
  join(resolve(searxEnginesDir()), `${code}${TRAITS_SUFFIX}`);

const _slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const _traitsKey = (keys: readonly string[], code: string): string | undefined => {
  const want = _slug(code);
  const exact = keys.find((key) => _slug(key) === want);
  if (exact) return exact;
  const shorter = keys.find((key) => {
    const other = _slug(key);
    return other.length >= SHORTEST_ALIAS && want.startsWith(other);
  });
  if (shorter) return shorter;
  return keys.find(
    (key) => want.length >= SHORTEST_ALIAS && _slug(key).startsWith(want),
  );
};

const _traitsBook = async (): Promise<Record<string, unknown>> => {
  const resp = await fetch(SEARX_TRAITS_URL, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Traits download failed with HTTP ${resp.status}`);
  const book: unknown = await resp.json();
  if (!book || typeof book !== "object") throw new Error("Traits file was not an object");
  return book as Record<string, unknown>;
};

const _saveTraits = async (code: string, book: Record<string, unknown>): Promise<void> => {
  const key = _traitsKey(Object.keys(book), code);
  const entry = key ? book[key] : undefined;
  await _writeSwap(_traitsPath(code), JSON.stringify(entry ?? {}));
};

const _pullTraits = async (codes: readonly string[]): Promise<void> => {
  if (codes.length === 0) return;
  try {
    const book = await _traitsBook();
    for (const code of codes) await _saveTraits(code, book);
    logger.debug(NS, `stored SearX traits for ${codes.join(", ")}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `could not fetch SearX engine traits: ${message}`);
  }
};

const _orphanDeps = (code: string): string[] =>
  catalogDeps(code).filter(
    (dep) =>
      isSupportFile(dep) &&
      _isInstalled(dep) &&
      !dependants(dep).some((other) => other !== code && _isInstalled(other)),
  );

const _libStatus = (code: string, missing: readonly PythonLib[]): SearxLibStatus[] =>
  engineLibs(code).map((lib) => ({
    module: lib,
    package: LIB_PACKAGES[lib],
    missing: missing.includes(lib),
  }));

export const listSearxItems = async (): Promise<SearxCatalogItem[]> => {
  const missing = await missingPythonLibs();
  return SEARX_CATALOG.map((entry) => ({
    code: entry.code,
    name: entry.name,
    types: entry.types,
    site: entry.site,
    deps: entry.deps,
    installed: _isInstalled(entry.code),
    missingDeps: _missingDeps(entry.code),
    libs: _libStatus(entry.code, missing),
  }));
};

const _pull = async (
  engine: string,
  queue: string[],
  verb: string,
): Promise<void> => {
  const dir = resolve(searxEnginesDir());
  try {
    for (const file of queue) await _fetchFile(file, dir);
    await _pullTraits(queue);
    logger.info(NS, `${verb} SearX engine ${engine} (${queue.join(", ")})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `could not fetch SearX engine ${engine}: ${message}`);
    throw new Error(message);
  }
};

export const installSearx = async (code: string): Promise<void> => {
  const engine = _known(code);
  await _pull(engine, [..._missingDeps(engine), engine], "installed");
};

export const updateSearx = async (code: string): Promise<void> => {
  const engine = _known(code);
  if (!_isInstalled(engine))
    throw new Error(`SearX engine "${engine}" is not installed`);
  await _pull(engine, [...catalogDeps(engine), engine], "updated");
};

export const uninstallSearx = async (code: string): Promise<void> => {
  const engine = _known(code);
  if (!_isInstalled(engine)) return;
  const queue = [engine, ..._orphanDeps(engine)];
  try {
    for (const file of queue) {
      await unlink(_enginePath(file));
      await unlink(_traitsPath(file)).catch(() => undefined);
      await _dropCache(file);
    }
    logger.info(NS, `uninstalled SearX engine ${engine} (${queue.join(", ")})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `uninstall of SearX engine ${engine} failed: ${message}`);
    throw new Error(message);
  }
};
