import { readdir } from "fs/promises";
import { basename, join, resolve } from "path";
import type { SearchEngine } from "../../../types/extension";
import type { EngineContext, TimeFilter } from "../../../types/search";
import type { SearchResult } from "../../../../shared/search-types";
import type { SettingField } from "../../../../shared/setting-field";
import { makeExtID } from "../../../utils/extension-support/extension-id";
import { logger } from "../../../utils/logger";
import { getRandomUserAgent } from "../../../utils/net/user-agents";
import { useCache } from "../../../utils/cache/cache";
import {
  asBoolean,
  getSettings,
  mergeDefaults,
  type SettingValue,
} from "../../../utils/settings/plugin-settings";
import { getInstanceSettings } from "../../../utils/settings/server-settings";
import { CompatLayerId } from "../../../../shared/compat-layers";
import type { CompatEntry } from "../registry";
import { runBridge, type RpcHandlers, type RunnerSpec } from "../rpc";
import { browserHeaders, cacheHandler, isWebUrl, toReply, withCookies } from "../engine-bridge";
import {
  resolveSafeSearch,
  SafeSearch,
  SAFE_SEARCH_KEY,
  safeSearchField,
  TIME_FILTER_RANGE,
} from "../safe-search";
import { scrubLog } from "../scrub-log";
import { catalogEntry, isKnownScraper, isSharedFile } from "./catalog";
import { optionFields, overridesFrom, type FourGetFilters } from "./engine-config";
import { followEngineFetch, isHttpRedirect } from "./follow";
import { nptKey } from "./npt-key";
import { FOURGET_PAGES, mapPages, type FourGetPage } from "./pages";
import { scrapersDir, sharedLibDir, stagingRoot } from "./paths";
import { phpBinary, phpStatus } from "./php-runtime";

const NS = "4get-compat";
const CACHE_NAMESPACE = "fourget-compat";
const NPT_TTL_MS = 15 * 60 * 1000;
const TYPE_OVERRIDE_KEY = "searchTypeOverride";
const API_KEY_SETTING = "apiKey";
const DAY_SECONDS = 24 * 60 * 60;

const SAFE_TO_NSFW: Record<SafeSearch, string> = {
  [SafeSearch.Off]: "yes",
  [SafeSearch.Moderate]: "maybe",
  [SafeSearch.Strict]: "no",
};

const GUARDED_METHODS = ["image", "video"];

const TIME_WINDOWS: Partial<Record<TimeFilter, number>> = {
  hour: DAY_SECONDS,
  day: DAY_SECONDS,
  week: 7 * DAY_SECONDS,
  month: 31 * DAY_SECONDS,
  year: 366 * DAY_SECONDS,
};

const runnerPath = join(import.meta.dir, "runner.php");

interface DiscoverEntry {
  code: string;
  types: string[];
  filters: FourGetFilters;
  error?: string;
}

interface DiscoverPayload {
  engines: DiscoverEntry[];
}

interface SearchPayload {
  results: SearchResult[];
  npt: string | null;
  related: string[];
}

interface StagedFile {
  code: string;
  src: string;
}

interface FourGetSpec {
  code: string;
  displayName: string;
  engineId: string;
  pages: FourGetPage[];
  filters: FourGetFilters;
}

const _spec = (): RunnerSpec => ({
  bin: phpBinary(),
  args: ["-d", "display_errors=stderr", "-d", "html_errors=0"],
  label: "4get",
});

const _safeId = (code: string): string => makeExtID(`4get-${code}`, "engine");

const _readDir = async (dir: string): Promise<string[]> => {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith(".php"));
  } catch {
    return [];
  }
};

const _staged = async (dir: string): Promise<StagedFile[]> =>
  (await _readDir(dir)).map((name) => ({
    code: basename(name, ".php"),
    src: join(dir, name),
  }));

const _config = (codes: string[]): Record<string, unknown> => {
  const config: Record<string, unknown> = {
    USER_AGENT: getRandomUserAgent(),
    USER_AGENT_FRIENDLY: "degoog",
    MARGINALIA_API_KEY: null,
    YEP_USE_API: false,
    BOT_PROTECTION: 0,
    API_ENABLED: 1,
  };
  for (const code of codes) config[`PROXY_${code.toUpperCase()}`] = false;
  return config;
};

const _apiKeys = async (codes: string[]): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const code of codes) {
    if (!catalogEntry(code)?.needsApiKey) continue;
    const settings = await getSettings(_safeId(code));
    const key = settings[API_KEY_SETTING];
    if (typeof key === "string" && key.trim()) out[code] = key.trim();
  }
  return out;
};

const _basePayload = async (): Promise<Record<string, unknown>> => {
  const libs = await _staged(resolve(sharedLibDir()));
  const scrapers = await _staged(resolve(scrapersDir()));
  const codes = scrapers.map((entry) => entry.code);
  return {
    root: resolve(stagingRoot()),
    libs,
    scrapers,
    pages: FOURGET_PAGES,
    config: _config(codes),
    apiKeys: await _apiKeys(codes),
  };
};

const _bridge = (engineId: string, engineName: string, context?: EngineContext): RpcHandlers => {
  const fetcher = (context?.fetch ?? fetch) as typeof fetch;
  return {
    onFetch: async (req) => {
      if (!isWebUrl(req.url)) {
        logger.warn(NS, `${engineId} blocked non-http request ${scrubLog(req.url)}`);
        throw new Error("only http(s) requests are allowed");
      }
      const headers = withCookies({ ...browserHeaders(context), ...req.headers }, req.cookies);
      logger.debug(NS, `${engineId} request ${scrubLog(req.method)} ${scrubLog(req.url)}`);
      const resp = await followEngineFetch(fetcher, {
        url: req.url,
        method: req.method,
        headers,
        data: req.data,
        follow: req.follow,
      });
      if (resp.url && !isWebUrl(resp.url)) {
        logger.warn(NS, `${engineId} blocked non-http redirect ${scrubLog(resp.url)}`);
        throw new Error("only http(s) responses are allowed");
      }
      if (!isHttpRedirect(resp.status)) {
        context?.sentinel?.({ ok: resp.ok, status: resp.status }, engineName);
      }
      return toReply(resp, req.url);
    },
    onCache: cacheHandler(CACHE_NAMESPACE, engineId),
  };
};

const _defaultSafe = (pages: FourGetPage[]): SafeSearch =>
  pages.some((page) => GUARDED_METHODS.includes(page.method))
    ? SafeSearch.Moderate
    : SafeSearch.Off;

const _epoch = (raw?: string): number | null => {
  if (!raw) return null;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.floor(at / 1000);
};

const _apiKeyField = (displayName: string): SettingField => ({
  key: API_KEY_SETTING,
  label: "API key",
  type: "password",
  default: "",
  description: `${displayName} returns nothing without one.`,
});

class FourGetCompatEngine implements SearchEngine {
  name: string;
  bangShortcut: string;
  safeSearch: SafeSearch;
  settingsSchema: SettingField[];
  private overrides: Record<string, string> = {};
  private pageByType = new Map<string, FourGetPage>();

  constructor(private spec: FourGetSpec) {
    this.name = spec.displayName;
    this.bangShortcut = spec.code;
    this.safeSearch = _defaultSafe(spec.pages);
    this.settingsSchema = [
      safeSearchField(this.safeSearch),
      ...(catalogEntry(spec.code)?.needsApiKey ? [_apiKeyField(spec.displayName)] : []),
      ...optionFields(spec.filters),
    ];
    this.remap(null);
  }

  private remap(override: string | null): void {
    this.pageByType = mapPages(this.spec.pages, override);
  }

  configure(settings: Record<string, SettingValue>): void {
    const stored = settings[SAFE_SEARCH_KEY];
    if (typeof stored === "string" && stored in SAFE_TO_NSFW) {
      this.safeSearch = stored as SafeSearch;
    }
    this.overrides = overridesFrom(settings);
    const override = settings[TYPE_OVERRIDE_KEY];
    this.remap(typeof override === "string" && override.trim() ? override : null);
  }

  private nsfw(context?: EngineContext): string {
    const resolved = resolveSafeSearch(this.safeSearch, context);
    return SAFE_TO_NSFW[resolved] ?? SAFE_TO_NSFW[SafeSearch.Off];
  }

  private dates(
    timeFilter: TimeFilter,
    context?: EngineContext,
  ): { timeRange: string | null; dateFrom: number | null; dateTo: number | null } {
    if (timeFilter === "custom") {
      return {
        timeRange: null,
        dateFrom: _epoch(context?.dateFrom),
        dateTo: _epoch(context?.dateTo),
      };
    }
    const window = TIME_WINDOWS[timeFilter];
    return {
      timeRange: TIME_FILTER_RANGE[timeFilter] ?? null,
      dateFrom: window ? Math.floor(Date.now() / 1000) - window : null,
      dateTo: null,
    };
  }

  private tokens(type: string) {
    return useCache<string>(`${CACHE_NAMESPACE}:npt:${this.spec.engineId}:${type}`, NPT_TTL_MS);
  }

  private tokenKey(
    query: string,
    page: number,
    timeFilter: TimeFilter,
    context?: EngineContext,
  ): string {
    return nptKey({
      query,
      page,
      nsfw: this.nsfw(context),
      timeFilter,
      dateFrom: context?.dateFrom,
      dateTo: context?.dateTo,
      overrides: this.overrides,
    });
  }

  async executeSearch(
    query: string,
    page = 1,
    timeFilter: TimeFilter = "any",
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    const type = context?.searchType ?? this.spec.pages[0]?.type ?? "web";
    const target = this.pageByType.get(type);
    if (!target) return [];

    const tokens = this.tokens(type);
    let npt: string | false = false;
    if (page > 1) {
      const stored = await tokens.get(this.tokenKey(query, page, timeFilter, context));
      if (!stored) {
        logger.debug(NS, `${this.spec.code} has no token for page ${page}, stopping there`);
        context?.pagination?.({ total: page - 1 });
        return [];
      }
      npt = stored;
    }

    const { timeRange, dateFrom, dateTo } = this.dates(timeFilter, context);
    const result = await runBridge<SearchPayload>(
      _spec(),
      runnerPath,
      {
        ...(await _basePayload()),
        action: "search",
        code: this.spec.code,
        type,
        query,
        source: this.name,
        npt,
        overrides: this.overrides,
        nsfw: this.nsfw(context),
        timeRange,
        dateFrom,
        dateTo,
      },
      _bridge(this.spec.engineId, this.name, context),
    );

    if (result.npt) {
      await tokens.set(this.tokenKey(query, page + 1, timeFilter, context), result.npt);
    }
    context?.pagination?.({ total: result.npt ? page + 1 : page });
    return result.results;
  }
}

export const isFourGetCompatOn = async (): Promise<boolean> =>
  asBoolean((await getInstanceSettings()).fourgetCompatEnabled);

const _displayName = (code: string): string => catalogEntry(code)?.name ?? code;

export const loadFourGetEngines = async (): Promise<CompatEntry[]> => {
  if (!(await isFourGetCompatOn())) {
    logger.debug(NS, "4get compatibility layer is off, skipping scraper discovery");
    return [];
  }
  const php = await phpStatus();
  if (!php.ok) {
    logger.warn(NS, `4get layer is on but has no usable php: ${php.reason}`);
    return [];
  }
  const scrapers = await _staged(resolve(scrapersDir()));
  const codes = scrapers
    .map((entry) => entry.code)
    .filter((code) => !isSharedFile(code) && isKnownScraper(code))
    .sort((a, b) => a.localeCompare(b));
  if (codes.length === 0) return [];

  let discovered: DiscoverEntry[];
  try {
    discovered = (
      await runBridge<DiscoverPayload>(_spec(), runnerPath, {
        ...(await _basePayload()),
        action: "discover",
        codes,
      })
    ).engines;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `4get discovery failed: ${message}`);
    return [];
  }

  const entries: CompatEntry[] = [];
  const broken: string[] = [];
  for (const meta of discovered) {
    if (meta.error) {
      broken.push(`${meta.code} (${meta.error})`);
      continue;
    }
    const pages = FOURGET_PAGES.filter((page) => meta.types.includes(page.type));
    if (pages.length === 0) continue;
    const id = _safeId(meta.code);
    const displayName = _displayName(meta.code);
    const instance = new FourGetCompatEngine({
      code: meta.code,
      displayName,
      engineId: id,
      pages,
      filters: meta.filters ?? {},
    });
    instance.configure(mergeDefaults(await getSettings(id), instance.settingsSchema));
    entries.push({
      id,
      displayName,
      searchTypes: meta.types,
      site: catalogEntry(meta.code)?.site,
      instance,
      source: "plugin",
      compatibilityLayer: CompatLayerId.FourGet,
    });
  }

  logger.info(NS, `4get compatibility layer imported - ${entries.length} scraper(s) available`);
  if (broken.length > 0) {
    logger.warn(NS, `scrapers that failed to load (${broken.length}): ${broken.sort().join(", ")}`);
  }
  return entries;
};
