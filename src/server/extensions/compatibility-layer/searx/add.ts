import { basename } from "path";
import { logger } from "../../../utils/logger";
import { scrubLog } from "../scrub-log";
import { isCuratedEngine, isSupportFile } from "./catalog";
import { customEntry, saveCustomEntry } from "./custom";
import { describeSearxFile, type SearxFileMeta } from "./index";
import {
  downloadSearxSource,
  installSearx,
  isSearxInstalled,
  pullSearxTraits,
  removeSearxFiles,
  searxEnginePath,
  upstreamSearxUrl,
  writeSearxFile,
} from "./install";
import { PythonLib } from "./python-deps";

const NS = "searx-add";
const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const PY_SUFFIX = ".py";
const MAX_FILES = 12;
const SHIMMED_SIBLINGS = new Set(["xpath"]);
const SIBLING_IMPORT =
  /^\s*(?:from\s+searx\.engines\.([a-z0-9_]+)\s+import|import\s+searx\.engines\.([a-z0-9_]+))/gm;
const GITHUB_BLOB = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/;
const GITHUB_RAW = "https://raw.githubusercontent.com/$1/$2/$3";

const LIB_PATTERNS: Readonly<Record<PythonLib, RegExp>> = {
  [PythonLib.Babel]: /^\s*(?:import|from)\s+babel\b|searx\.locales|from searx import locales/m,
  [PythonLib.DateUtil]: /^\s*(?:import|from)\s+dateutil\b/m,
  [PythonLib.Lxml]: /\blxml\b|eval_xpath|extract_text|html_to_text|extract_url|\.html\(\)/,
};

interface SearxSource {
  code: string;
  url: string;
  byName: boolean;
}

interface Download {
  code: string;
  source: string;
}

const _fail = (message: string): never => {
  throw new Error(message);
};

const _fromLink = (raw: string): SearxSource => {
  let url: URL;
  try {
    url = new URL(raw.replace(GITHUB_BLOB, GITHUB_RAW));
  } catch {
    return _fail("Enter a SearXNG engine name or an https link to its .py file");
  }
  if (url.protocol !== "https:") _fail("Only https links can be added");
  const file = basename(url.pathname);
  if (!file.endsWith(PY_SUFFIX)) _fail("The link has to point at a .py file");
  const code = file.slice(0, -PY_SUFFIX.length);
  if (!CODE_PATTERN.test(code)) _fail(`"${file}" is not a usable engine file name`);
  url.search = "";
  url.hash = "";
  return { code, url: url.href, byName: false };
};

const _sourceOf = (input: string): SearxSource => {
  const raw = input.trim();
  if (CODE_PATTERN.test(raw)) return { code: raw, url: upstreamSearxUrl(raw), byName: true };
  return _fromLink(raw);
};

const _siblings = (source: string): string[] => {
  const found = new Set<string>();
  for (const match of source.matchAll(SIBLING_IMPORT)) {
    const name = match[1] ?? match[2];
    if (name && !SHIMMED_SIBLINGS.has(name)) found.add(name);
  }
  return [...found];
};

const _gather = async (root: SearxSource): Promise<{ files: Download[]; deps: string[] }> => {
  const files: Download[] = [];
  const deps: string[] = [];
  const seen = new Set<string>([root.code]);
  const queue: Array<{ code: string; url: string }> = [root];
  for (let next = queue.shift(); next; next = queue.shift()) {
    const source = await downloadSearxSource(next.url);
    files.push({ code: next.code, source });
    for (const sibling of _siblings(source)) {
      if (seen.has(sibling)) continue;
      seen.add(sibling);
      if (seen.size > MAX_FILES) _fail(`${root.code} pulls in more than ${MAX_FILES} files`);
      deps.push(sibling);
      if (isSearxInstalled(sibling)) continue;
      queue.push({ code: sibling, url: new URL(`${sibling}${PY_SUFFIX}`, next.url).href });
    }
  }
  return { files, deps };
};

const _libsOf = (files: readonly Download[]): PythonLib[] =>
  Object.values(PythonLib).filter((lib) =>
    files.some((file) => LIB_PATTERNS[lib].test(file.source)),
  );

const _guard = (source: SearxSource): void => {
  if (isSupportFile(source.code)) {
    _fail(`"${source.code}" is shared code other engines borrow, not an engine of its own`);
  }
  if (!source.byName && isCuratedEngine(source.code)) {
    _fail(`"${source.code}" is already in the list, install it from there`);
  }
  if (customEntry(source.code)) {
    _fail(`"${source.code}" was already added, use its update button to pull it again`);
  }
  if (isSearxInstalled(source.code)) _fail(`An engine called "${source.code}" is already installed`);
};

const _check = async (code: string): Promise<SearxFileMeta> => {
  try {
    const meta = await describeSearxFile(searxEnginePath(code));
    if (meta.offline) _fail("it does not search the web, only online engines run in Degoog");
    return meta;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${code} could not be loaded: ${message}`);
  }
};

export const addSearx = async (input: string): Promise<string> => {
  const source = _sourceOf(input);
  if (source.byName && isCuratedEngine(source.code)) {
    await installSearx(source.code);
    return source.code;
  }
  _guard(source);
  const { files, deps } = await _gather(source);
  const ordered = [...files].reverse();
  const written = ordered.map((file) => file.code);
  try {
    for (const file of ordered) await writeSearxFile(file.code, file.source);
    await pullSearxTraits(written);
    const meta = await _check(source.code);
    await saveCustomEntry({
      code: source.code,
      name: meta.name,
      types: meta.types,
      site: meta.site,
      source: source.url,
      deps,
      libs: _libsOf(files),
    });
  } catch (err) {
    await removeSearxFiles(written);
    logger.warn(NS, `adding SearX engine from ${scrubLog(source.url)} failed`, err);
    throw err;
  }
  logger.info(NS, `added SearX engine ${source.code} (${written.join(", ")})`);
  return source.code;
};
