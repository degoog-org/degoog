import { mkdir, readdir, rename, rm, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { randomBytes } from "crypto";
import { join, resolve } from "path";
import { logger } from "../../../utils/logger";
import { createMutex } from "../../../utils/cache/mutex";
import type { CompatCatalogItem, CompatRuntimeNeed } from "../../../../shared/compat-layers";
import {
  FOURGET_CATALOG,
  FOURGET_SOURCE_BASE_URL,
  catalogDeps,
  catalogEntry,
  isKnownScraper,
  scraperUrl,
  sharedUrl,
} from "./catalog";
import { isHttpRedirect } from "./follow";
import { scrapersDir, sharedLibDir, stagingRoot } from "./paths";
import { EXT_PACKAGES, phpStatus } from "./php-runtime";

const NS = "4get-compat";
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_DOWNLOAD_REDIRECTS = 5;

const _sourceHost = (): string => new URL(FOURGET_SOURCE_BASE_URL).hostname;

const _allowedSource = (raw: string): boolean => {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && parsed.hostname === _sourceHost();
  } catch {
    return false;
  }
};

export const withFourGetLock = createMutex();

const _scraperPath = (code: string): string =>
  join(resolve(scrapersDir()), `${code}.php`);

const _libPath = (code: string): string => join(resolve(sharedLibDir()), `${code}.php`);

const _isInstalled = (code: string): boolean => existsSync(_scraperPath(code));

const _hasLib = (code: string): boolean => existsSync(_libPath(code));

const _known = (code: string): string => {
  if (!isKnownScraper(code)) throw new Error(`"${code}" is not a known 4get scraper`);
  return code;
};

const _download = async (url: string): Promise<string> => {
  if (!_allowedSource(url)) throw new Error("refused non-https 4get source");
  let current = url;
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_DOWNLOAD_REDIRECTS; hop++) {
    const resp = await fetch(current, { signal, redirect: "manual" });
    if (isHttpRedirect(resp.status)) {
      const loc = resp.headers.get("location");
      if (!loc) throw new Error(`Download failed with HTTP ${resp.status}`);
      let next: string;
      try {
        next = new URL(loc, current).href;
      } catch {
        throw new Error("4get download returned a malformed redirect");
      }
      if (!_allowedSource(next)) throw new Error("refused off-host 4get redirect");
      current = next;
      continue;
    }
    if (!resp.ok) throw new Error(`Download failed with HTTP ${resp.status}`);
    const source = await resp.text();
    if (!source.trim()) throw new Error("Downloaded file was empty");
    if (!source.includes("<?php")) throw new Error("Downloaded file is not php");
    return source;
  }
  throw new Error("too many 4get download redirects");
};

const _writeSwap = async (target: string, dir: string, body: string): Promise<void> => {
  const tmp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(tmp, body, "utf-8");
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
};

const _dropStaged = async (code: string): Promise<void> => {
  const staged = [
    join(resolve(stagingRoot()), "scraper", `${code}.php`),
    join(resolve(stagingRoot()), "lib", `${code}.php`),
  ];
  for (const path of staged) await rm(path, { force: true }).catch(() => undefined);
};

const _fetchLib = async (code: string): Promise<void> => {
  const source = await _download(sharedUrl(code));
  await _writeSwap(_libPath(code), resolve(sharedLibDir()), source);
  await _dropStaged(code);
};

const _fetchScraper = async (code: string): Promise<void> => {
  const source = await _download(scraperUrl(code));
  await _writeSwap(_scraperPath(code), resolve(scrapersDir()), source);
  await _dropStaged(code);
};

const _missingDeps = (code: string): string[] =>
  catalogDeps(code).filter((dep) => !_hasLib(dep));

const _installedCodes = async (): Promise<string[]> => {
  try {
    const names = await readdir(resolve(scrapersDir()));
    return names.filter((n) => n.endsWith(".php")).map((n) => n.slice(0, -4));
  } catch {
    return [];
  }
};

const _orphanDeps = async (code: string): Promise<string[]> => {
  const others = (await _installedCodes()).filter((other) => other !== code);
  const stillWanted = new Set(others.flatMap((other) => catalogDeps(other)));
  return catalogDeps(code).filter((dep) => !stillWanted.has(dep) && _hasLib(dep));
};

const _runtimeNeeds = async (): Promise<CompatRuntimeNeed[]> => {
  const status = await phpStatus();
  return status.missingExts.map((ext) => ({
    module: ext,
    package: EXT_PACKAGES[ext],
    missing: true,
  }));
};

const _notes = (code: string): string[] => {
  const entry = catalogEntry(code);
  const out: string[] = [];
  if (entry?.needsApiKey) out.push("needs-api-key");
  if (entry?.wantsImpersonation) out.push("wants-impersonation");
  return out;
};

export const listFourGetItems = async (): Promise<CompatCatalogItem[]> => {
  const runtime = await _runtimeNeeds();
  return FOURGET_CATALOG.map((entry) => ({
    code: entry.code,
    name: entry.name,
    types: [...entry.types],
    site: entry.site,
    deps: catalogDeps(entry.code),
    notes: _notes(entry.code),
    installed: _isInstalled(entry.code),
    missingDeps: _missingDeps(entry.code),
    runtime,
  }));
};

const _pull = async (code: string, libs: string[], verb: string): Promise<void> => {
  try {
    for (const lib of libs) await _fetchLib(lib);
    await _fetchScraper(code);
    const also = libs.length > 0 ? ` (with ${libs.join(", ")})` : "";
    logger.info(NS, `${verb} 4get scraper ${code}${also}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `could not fetch 4get scraper ${code}: ${message}`);
    throw new Error(message);
  }
};

export const installFourGet = async (code: string): Promise<void> => {
  const scraper = _known(code);
  await _pull(scraper, _missingDeps(scraper), "installed");
};

export const updateFourGet = async (code: string): Promise<void> => {
  const scraper = _known(code);
  if (!_isInstalled(scraper)) throw new Error(`4get scraper "${scraper}" is not installed`);
  await _pull(scraper, catalogDeps(scraper), "updated");
};

export const uninstallFourGet = async (code: string): Promise<void> => {
  const scraper = _known(code);
  if (!_isInstalled(scraper)) return;
  const orphans = await _orphanDeps(scraper);
  try {
    await unlink(_scraperPath(scraper));
    await _dropStaged(scraper);
    for (const lib of orphans) {
      await unlink(_libPath(lib));
      await _dropStaged(lib);
    }
    const also = orphans.length > 0 ? ` (and ${orphans.join(", ")})` : "";
    logger.info(NS, `uninstalled 4get scraper ${scraper}${also}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `uninstall of 4get scraper ${scraper} failed: ${message}`);
    throw new Error(message);
  }
};
