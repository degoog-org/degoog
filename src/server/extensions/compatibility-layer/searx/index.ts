import { readdir } from "fs/promises";
import { basename, join, resolve } from "path";
import type { SearchEngine } from "../../../types/extension";
import type { EngineContext, TimeFilter } from "../../../types/search";
import type { SearchResult } from "../../../../shared/search-types";
import type { SettingField } from "../../../../shared/setting-field";
import { CompatLayerId } from "../../../../shared/compat-layers";
import type { CompatEntry } from "../registry";
import { makeExtID } from "../../../utils/extension-support/extension-id";
import { logger } from "../../../utils/logger";
import {
  asBoolean,
  getSettings,
  mergeDefaults,
  type SettingValue,
} from "../../../utils/settings/plugin-settings";
import { getInstanceSettings } from "../../../utils/settings/server-settings";
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
import { catalogEntry, isSupportFile, isSupportedEngine, SEARX_EXTRA_ENGINES_ENV } from "./catalog";
import {
  optionFields,
  overridesFrom,
  type SearxConfigField,
} from "./engine-config";
import { LIB_PACKAGES, missingPythonLibs } from "./python-deps";
import { searxEnginesDir } from "./paths";

interface DiscoverPayload {
  path: string;
  id: string;
  name: string;
  types: string[];
  paging?: boolean;
  maxPage?: number;
  timeRangeSupport?: boolean;
  offline?: boolean;
  error?: string;
  config?: SearxConfigField[];
}

interface DiscoverAllPayload {
  engines: DiscoverPayload[];
}

interface DiscoverRequest {
  path: string;
  overrides: Record<string, string>;
}

interface SearxEngineSpec {
  path: string;
  displayName: string;
  bangShortcut: string;
  engineId: string;
  paging: boolean;
  maxPage: number;
  timeRanges: boolean;
  types: string[];
  config: SearxConfigField[];
}

interface RequestPayload {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  data?: string;
}

interface ResponsePayload {
  results: SearchResult[];
}

const runnerPath = join(import.meta.dir, "runner.py");

const CACHE_NAMESPACE = "searx-compat";
const NS = "searx-compat";

const SAFE_SEARCH_LEVELS: Record<SafeSearch, number> = {
  [SafeSearch.Off]: 0,
  [SafeSearch.Moderate]: 1,
  [SafeSearch.Strict]: 2,
};

const GUARDED_TYPES = ["images", "videos"];

const DAY_MS = 24 * 60 * 60 * 1000;

const SEARX_TIME_RANGES = [
  { range: "day", within: DAY_MS },
  { range: "week", within: 7 * DAY_MS },
  { range: "month", within: 31 * DAY_MS },
  { range: "year", within: 366 * DAY_MS },
] as const;

const _pythonSpec = (): RunnerSpec => ({
  bin: process.env.DEGOOG_PYTHON_BIN ?? "python3",
  args: [],
  label: "SearX",
});

const _runPython = <T>(payload: Record<string, unknown>, handlers: RpcHandlers = {}): Promise<T> =>
  runBridge<T>(_pythonSpec(), runnerPath, payload, handlers);

const _safeId = (name: string): string => makeExtID(`searx-${name}`, "engine");

const _bridge = (engineId: string, context?: EngineContext): RpcHandlers => {
  const fetcher = (context?.fetch ?? fetch) as typeof fetch;
  return {
    onFetch: async (req) => {
      if (!isWebUrl(req.url)) {
        logger.warn(NS, `${engineId} blocked non-http request ${scrubLog(req.url)}`);
        throw new Error("only http(s) requests are allowed");
      }
      const headers = withCookies({ ...browserHeaders(context), ...req.headers }, req.cookies);
      logger.debug(NS, `${engineId} side request ${scrubLog(req.method)} ${scrubLog(req.url)}`);
      const resp = await fetcher(req.url, {
        headers,
        redirect: "follow",
        ...(req.method !== "GET" ? { method: req.method } : {}),
        ...(req.data ? { body: req.data } : {}),
      });
      if (resp.url && !isWebUrl(resp.url)) {
        logger.warn(NS, `${engineId} blocked non-http redirect target ${scrubLog(resp.url)}`);
        throw new Error("only http(s) responses are allowed");
      }
      return toReply(resp, req.url);
    },
    onCache: cacheHandler(CACHE_NAMESPACE, engineId),
  };
};

const _safesearch = (engineSafe: SafeSearch, context?: EngineContext): number => {
  const resolved = resolveSafeSearch(engineSafe, context);
  return SAFE_SEARCH_LEVELS[resolved] ?? SAFE_SEARCH_LEVELS[SafeSearch.Off];
};

const _rangeFromDates = (dateFrom?: string, dateTo?: string): string | null => {
  const oldest = dateFrom || dateTo;
  if (!oldest) return null;
  const at = Date.parse(oldest);
  if (Number.isNaN(at)) return null;
  const elapsed = Date.now() - at;
  const bucket = SEARX_TIME_RANGES.find((entry) => elapsed <= entry.within);
  return bucket ? bucket.range : null;
};

const _timeRange = (
  timeFilter: TimeFilter,
  context?: EngineContext,
): string | null => {
  if (timeFilter === "custom") {
    return _rangeFromDates(context?.dateFrom, context?.dateTo);
  }
  return TIME_FILTER_RANGE[timeFilter] ?? null;
};

const _defaultSafe = (types: string[]): SafeSearch =>
  types.some((type) => GUARDED_TYPES.includes(type.toLowerCase()))
    ? SafeSearch.Moderate
    : SafeSearch.Off;

class SearxCompatEngine implements SearchEngine {
  name: string;
  bangShortcut: string;
  safeSearch: SafeSearch;
  settingsSchema: SettingField[];
  private overrides: Record<string, string> = {};

  constructor(private spec: SearxEngineSpec) {
    this.name = spec.displayName;
    this.bangShortcut = spec.bangShortcut;
    this.safeSearch = _defaultSafe(spec.types);
    this.settingsSchema = [
      safeSearchField(this.safeSearch),
      ...optionFields(spec.config),
    ];
  }

  configure(settings: Record<string, SettingValue>): void {
    const stored = settings[SAFE_SEARCH_KEY];
    if (typeof stored === "string" && stored in SAFE_SEARCH_LEVELS) {
      this.safeSearch = stored as SafeSearch;
    }
    this.overrides = overridesFrom(settings);
  }

  async executeSearch(
    query: string,
    page = 1,
    timeFilter: TimeFilter = "any",
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    const declaredPages = !this.spec.paging ? 1 : this.spec.maxPage;
    if (declaredPages > 0) context?.pagination?.({ total: declaredPages });
    if (page > 1 && !this.spec.paging) return [];
    const fetcher = context?.fetch ?? fetch;
    const bridge = _bridge(this.spec.engineId, context);
    const safesearch = _safesearch(this.safeSearch, context);
    const timeRange = this.spec.timeRanges ? _timeRange(timeFilter, context) : null;
    const req = await _runPython<RequestPayload>(
      {
        action: "request",
        path: this.spec.path,
        name: this.name,
        query,
        page,
        timeFilter: timeRange,
        locale: context?.lang ?? "all",
        safesearch,
        headers: browserHeaders(context),
        overrides: this.overrides,
      },
      bridge,
    );
    if (!req.url || !/^https?:\/\//i.test(req.url)) {
      throw new Error(`${this.name} needs an instance URL configured before it can search`);
    }
    const headers = withCookies({ ...(req.headers ?? {}) }, req.cookies);
    const init: RequestInit = {
      headers,
      redirect: "follow",
      ...(req.method && req.method !== "GET" ? { method: req.method } : {}),
      ...(req.data ? { body: req.data } : {}),
    };
    const resp = await (fetcher as typeof fetch)(req.url, init);
    context?.sentinel?.({ ok: resp.ok, status: resp.status }, this.name);
    const response = await toReply(resp, req.url);
    const parsed = await _runPython<ResponsePayload>(
      {
        action: "response",
        path: this.spec.path,
        name: this.name,
        source: this.name,
        query,
        page,
        timeFilter: timeRange,
        locale: context?.lang ?? "all",
        safesearch,
        headers: browserHeaders(context),
        overrides: this.overrides,
        request: { ...req, url: req.url, headers },
        response,
      },
      bridge,
    );
    return parsed.results;
  }
}

const _pythonHint = async (): Promise<void> => {
  const missing = await missingPythonLibs();
  if (missing.length === 0) return;
  const packages = missing.map((lib) => LIB_PACKAGES[lib]);
  logger.warn(
    NS,
    `missing python libs (${packages.join(", ")}), install them with "pip install ${packages.join(" ")}" and restart`,
  );
};

export const isSearxCompatOn = async (): Promise<boolean> =>
  asBoolean((await getInstanceSettings()).searxCompatEnabled);

export const loadSearxCompatibilityEngines = async (): Promise<CompatEntry[]> => {
  if (!(await isSearxCompatOn())) {
    logger.debug(NS, "SearX compatibility layer is off, skipping engine discovery");
    return [];
  }
  const dir = resolve(searxEnginesDir());
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    logger.debug("searx-compat", `No SearX engines dir at ${dir}`, err);
    return [];
  }
  const files = names
    .filter((name) => name.endsWith(".py") && !name.startsWith("__"))
    .filter((name) => !isSupportFile(basename(name, ".py")))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) return [];
  const stored = new Map<string, Record<string, SettingValue>>();
  const paths: DiscoverRequest[] = [];
  for (const file of files) {
    const code = basename(file, ".py");
    const settings = await getSettings(_safeId(code));
    stored.set(code, settings);
    paths.push({ path: join(dir, file), overrides: overridesFrom(settings) });
  }
  let discovered: DiscoverPayload[];
  try {
    discovered = (await _runPython<DiscoverAllPayload>({ action: "discover_all", paths })).engines;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `SearX discovery failed: ${message}`);
    return [];
  }
  const entries: CompatEntry[] = [];
  const offline: string[] = [];
  const unlisted: string[] = [];
  const broken: string[] = [];
  for (const meta of discovered) {
    const file = basename(meta.path ?? "", ".py");
    const code = meta.id || file;
    if (meta.error) {
      broken.push(`${code} (${meta.error})`);
      continue;
    }
    if (meta.offline) {
      offline.push(code);
      continue;
    }
    if (!isSupportedEngine(code)) {
      unlisted.push(code);
      continue;
    }
    const rawId = code;
    const id = _safeId(rawId);
    const types = meta.types?.length ? meta.types : ["web"];
    const instance = new SearxCompatEngine({
      path: meta.path,
      displayName: meta.name || file,
      bangShortcut: rawId,
      engineId: id,
      paging: meta.paging === true,
      maxPage: meta.maxPage ?? 0,
      timeRanges: meta.timeRangeSupport === true,
      types,
      config: meta.config ?? [],
    });
    const settings = stored.get(file) ?? (await getSettings(id));
    instance.configure(mergeDefaults(settings, instance.settingsSchema));
    entries.push({
      id,
      displayName: meta.name || file,
      searchTypes: types,
      site: catalogEntry(rawId)?.site,
      instance,
      source: "plugin",
      compatibilityLayer: CompatLayerId.Searx,
    });
  }
  logger.info(NS, `SearX compatibility layer imported - ${entries.length} engine(s) available`);
  if (offline.length > 0) {
    logger.info(NS, `offline engines skipped (${offline.length}): ${offline.sort().join(", ")}`);
  }
  if (unlisted.length > 0) {
    logger.info(
      NS,
      `not on the tested compatibility list (${unlisted.length}): ${unlisted.sort().join(", ")} - set ${SEARX_EXTRA_ENGINES_ENV} to load them anyway, they may still not work`,
    );
  }
  if (broken.length > 0) {
    logger.warn(NS, `engines that failed to load (${broken.length}): ${broken.sort().join(", ")}`);
    await _pythonHint();
  }
  return entries;
};
