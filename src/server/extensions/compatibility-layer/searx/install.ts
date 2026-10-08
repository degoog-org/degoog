import { mkdir, readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { logger } from "../../../utils/logger";
import { createMutex } from "../../../utils/cache/mutex";
import { writeFileAtomic } from "../../../utils/storage/atomic-json";
import {
  SEARX_CATALOG,
  SEARX_SOURCE_BASE_URL,
  SEARX_TRAITS_URL,
  catalogDeps,
  catalogEntry,
  dependants,
  engineLibs,
  isCuratedEngine,
  isSupportFile,
  isSupportedEngine,
} from "./catalog";
import { customEntries, customEntry, dropCustomEntry } from "./custom";
import type { SearxCatalogItem, SearxLibStatus } from "./catalog-types";
import { searxEnginesDir } from "./paths";
import { TRAITS_SUFFIX } from "./traits";
import { LIB_PACKAGES, missingPythonLibs, type PythonLib } from "./python-deps";

const NS = "searx-install";
const PYCACHE_DIR = "__pycache__";
const DOWNLOAD_TIMEOUT_MS = 20_000;
const SHORTEST_ALIAS = 4;

export const withSearxLock = createMutex();

const _enginePath = (code: string): string => join(resolve(searxEnginesDir()), `${code}.py`);

export const isSearxInstalled = (code: string): boolean => existsSync(_enginePath(code));

const _isInstalled = isSearxInstalled;

export const searxEnginePath = _enginePath;

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

export const upstreamSearxUrl = (code: string): string => `${SEARX_SOURCE_BASE_URL}/${code}.py`;

const _fileUrl = (file: string, owner: string): string => {
  const custom = customEntry(owner);
  return custom ? new URL(`${file}.py`, custom.source).href : upstreamSearxUrl(file);
};

export const downloadSearxSource = async (url: string): Promise<string> => {
  const resp = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Download failed with HTTP ${resp.status}`);
  const source = await resp.text();
  if (!source.trim()) throw new Error("Downloaded engine file was empty");
  return source;
};

const _missingDeps = (code: string): string[] =>
  catalogDeps(code).filter((dep) => !_isInstalled(dep));

export const writeSearxFile = async (code: string, source: string): Promise<void> => {
  await mkdir(resolve(searxEnginesDir()), { recursive: true });
  await writeFileAtomic(_enginePath(code), source);
  await _dropCache(code);
};

const _fetchFile = async (code: string, url: string): Promise<void> => {
  await writeSearxFile(code, await downloadSearxSource(url));
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
  await writeFileAtomic(_traitsPath(code), JSON.stringify(entry ?? {}));
};

export const pullSearxTraits = async (codes: readonly string[]): Promise<void> => {
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
      (isSupportFile(dep) || !isSupportedEngine(dep)) &&
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
  const custom = customEntries().filter((entry) => !isCuratedEngine(entry.code));
  return [...SEARX_CATALOG, ...custom].map((entry) => ({
    code: entry.code,
    name: entry.name,
    types: entry.types,
    site: entry.site,
    deps: entry.deps,
    installed: _isInstalled(entry.code),
    missingDeps: _missingDeps(entry.code),
    libs: _libStatus(entry.code, missing),
    custom: !isCuratedEngine(entry.code),
  }));
};

const _pull = async (
  engine: string,
  queue: string[],
  verb: string,
): Promise<void> => {
  try {
    for (const file of queue) await _fetchFile(file, _fileUrl(file, engine));
    await pullSearxTraits(queue);
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

export const removeSearxFiles = async (codes: readonly string[]): Promise<void> => {
  for (const file of codes) {
    await unlink(_enginePath(file)).catch(() => undefined);
    await unlink(_traitsPath(file)).catch(() => undefined);
    await _dropCache(file);
  }
};

export const uninstallSearx = async (code: string): Promise<void> => {
  const engine = _known(code);
  if (!_isInstalled(engine)) {
    await dropCustomEntry(engine);
    return;
  }
  const queue = [engine, ..._orphanDeps(engine)];
  try {
    for (const file of queue) {
      await unlink(_enginePath(file));
      await unlink(_traitsPath(file)).catch(() => undefined);
      await _dropCache(file);
    }
    await dropCustomEntry(engine);
    logger.info(NS, `uninstalled SearX engine ${engine} (${queue.join(", ")})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `uninstall of SearX engine ${engine} failed: ${message}`);
    throw new Error(message);
  }
};
