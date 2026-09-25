import { renderHtml } from "../../shared/ui/tribute/html";
import { ResultsMeta } from "./results-meta";
import { Hono, type Context } from "hono";
import {
  matchBangCommand,
  type BangMatch,
} from "../extensions/commands/registry";
import { getDefaultEngineConfig, getEngineSearchType } from "../extensions/engines/catalog";
import { build404 } from "../routes/pages/pages";
import { handleRetry, handleSearch } from "../search/handlers";
import { handleTabSearch } from "../search/tab-search";
import { sanePage } from "../search/page-counter";
import {
  type EngineTiming,
  isImageSearchType,
  resolveBuiltinSearchType,
  type ScoredResult,
} from "../../shared/search-types";
import type { SearchParams, SearchType, TimeFilter } from "../types/search";
import { getLocale } from "../utils/hono";
import { logger } from "../utils/logger";
import { hasPinged, strike } from "../utils/security/link-token";
import { getClientIp } from "../utils/net/request";
import { _applyRateLimit, isValidQuery } from "../utils/search";
import { addClassWhereClass, fillById } from "./dom";
import { nojsHome, RETRY_PARAM, type NojsQuery } from "./links";
import { buildNojsDocument, getNojsTranslator, loadNojsPartial, loadNojsShell } from "./render";
import { renderNojsCommand } from "./commands/commands";
import {
  buildNojsResultsPage,
  renderNojsFooter,
  renderNojsHomeSearch,
  renderNojsPagination,
  renderNojsResults,
  renderNojsResultsHeader,
  renderNojsTabRow,
} from "./page-parts";
import { isNojsCssCheckOn, isNojsEnabled } from "./settings";
import { renderNojsKnowledgePanels, renderNojsSidebar } from "./sidebar/sidebar";
import { renderNojsSlots } from "./slots";
import { ENGINE_TYPE_PREFIX, WEB_TAB_ID, nojsTabType, stripTabTypePrefix } from "./tabs";

const router = new Hono();

const VIDEO_SEARCH_TYPE = "videos";
const HOME_BODY_CLASS = "nojs nojs-home";
const NOJS_PAGE_TOTAL = 10;

interface NojsOutcome {
  results: ScoredResult[];
  totalPages: number | undefined;
  totalTime: number;
  engineTimings: EngineTiming[];
  canRetry: boolean;
}

const _notFound = async (c: Context): Promise<Response> =>
  c.html(await build404(getLocale(c)), 404);

const _disabled = async (c: Context): Promise<Response | null> =>
  (await isNojsEnabled()) ? null : _notFound(c);

const _rateLimited = async (c: Context): Promise<Response | null> => {
  const limited = await _applyRateLimit(c);
  if (!limited) return null;
  const retryAfter = limited.headers.get("Retry-After");
  const t = await getNojsTranslator();
  const locale = getLocale(c) ?? "";
  const message = String(t("nojs.rate-limited", undefined, locale));
  return c.html(
    `<!doctype html><html><head><meta charset="UTF-8"><title>429</title></head><body><p>${message}</p></body></html>`,
    429,
    retryAfter ? { "Retry-After": retryAfter } : undefined,
  );
};

const _toQuery = (field: (name: string) => string): NojsQuery => ({
  q: field("q"),
  type: field("type"),
  page: sanePage(field("page")),
  time: field("time") || "any",
  lang: field("lang"),
  dateFrom: field("dateFrom"),
  dateTo: field("dateTo"),
});

const _readQuery = async (
  c: Context,
): Promise<{ query: NojsQuery; retry: string }> => {
  if (c.req.method !== "POST") {
    return {
      query: _toQuery((name) => c.req.query(name) ?? ""),
      retry: c.req.query(RETRY_PARAM) ?? "",
    };
  }
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (err) {
    logger.debug("nojs", "invalid form data", err);
    form = new FormData();
  }
  return {
    query: _toQuery((name) => {
      const value = form.get(name);
      return typeof value === "string" ? value : "";
    }),
    retry: "",
  };
};

const _searchParams = (
  text: string,
  query: NojsQuery,
  searchType: string,
  engines: Record<string, boolean>,
): SearchParams => ({
  query: text,
  engines,
  searchType: searchType as SearchType,
  page: query.page ?? 1,
  timeFilter: (query.time || "any") as TimeFilter,
  lang: query.lang ?? "",
  dateFrom: query.dateFrom ?? "",
  dateTo: query.dateTo ?? "",
  imageFilter: undefined,
});

const _outcome = (
  r: { results: ScoredResult[]; totalPages?: number; totalTime: number; engineTimings?: EngineTiming[] },
  canRetry: boolean,
): NojsOutcome => ({
  results: r.results,
  totalPages: r.totalPages,
  totalTime: r.totalTime,
  engineTimings: r.engineTimings ?? [],
  canRetry,
});

const _runSearch = async (
  c: Context,
  query: NojsQuery,
  bang: BangMatch | null,
  retry: string,
): Promise<NojsOutcome | null> => {
  if (bang?.type === "engine") {
    const resolvedType =
      (await getEngineSearchType(bang.engineId, query.type || undefined)) ??
      WEB_TAB_ID;
    const response = await handleSearch(
      _searchParams(
        bang.query,
        query,
        resolveBuiltinSearchType(resolvedType) || WEB_TAB_ID,
        { [bang.engineId]: true },
      ),
    );
    return _outcome(response, false);
  }

  const tabId = stripTabTypePrefix(query.type ?? "");

  if (tabId && tabId !== WEB_TAB_ID && !tabId.startsWith(ENGINE_TYPE_PREFIX)) {
    const tabResult = await handleTabSearch({
      tabId,
      query: query.q,
      page: query.page ?? 1,
      clientIp: getClientIp(c),
    });
    return tabResult && _outcome(tabResult, false);
  }

  const searchType = resolveBuiltinSearchType(tabId) || WEB_TAB_ID;
  const params = _searchParams(
    query.q,
    query,
    searchType,
    getDefaultEngineConfig(),
  );

  if (retry) {
    const retried = await handleRetry({ ...params, engineName: retry });
    return _outcome(retried, true);
  }

  return _outcome(await handleSearch(params), true);
};

router.get("/nojs", async (c) => {
  const denied = await _disabled(c);
  if (denied) return denied;

  const locale = getLocale(c) ?? "";
  const t = await getNojsTranslator();
  const shell = await loadNojsShell("index");
  if (!shell) return _notFound(c);

  let content = await fillById(
    shell,
    "header",
    (await loadNojsPartial("home-header", t, locale)) ?? "",
  );
  content = await fillById(
    content,
    "home-logo",
    await addClassWhereClass(
      (await loadNojsPartial("logo", t, locale)) ?? "",
      "logo-letter",
      "nojs-logo-letter",
    ),
  );
  content = await fillById(
    content,
    "home-search",
    await renderNojsHomeSearch(c, t, locale),
  );
  content = await fillById(content, "home-footer", await renderNojsFooter(t, locale));

  const html = await buildNojsDocument(content, locale, HOME_BODY_CLASS);
  if (!html) return _notFound(c);
  return c.html(html);
});

router.on(["GET", "POST"], "/nojs/search", async (c) => {
  const denied = await _disabled(c);
  if (denied) return denied;

  const limited = await _rateLimited(c);
  if (limited) return limited;

  const { query, retry } = await _readQuery(c);
  if (!isValidQuery(query.q)) return c.redirect(nojsHome(c), 302);

  const ip = getClientIp(c);
  if (ip && (await isNojsCssCheckOn()) && !hasPinged(ip)) {
    await strike(ip);
  }

  const locale = getLocale(c) ?? "";
  const t = await getNojsTranslator();

  const bang = matchBangCommand(query.q);
  if (bang?.type === "command") {
    const commandPageNumber = query.page ?? 1;
    const command = await renderNojsCommand(
      bang,
      ip,
      locale,
      t,
      commandPageNumber,
    );
    const commandPage = await buildNojsResultsPage(
      {
        header: await renderNojsResultsHeader(c, query, t, locale),
        tabs: "",
        meta: "",
        list: command.html,
        pagination: await renderNojsPagination(
          c,
          query,
          commandPageNumber,
          command.totalPages,
          t,
          locale,
        ),
        sidebar: "",
        slots: {},
        mediaMode: false,
        footer: await renderNojsFooter(t, locale),
      },
      locale,
    );
    if (!commandPage) return _notFound(c);
    return c.html(commandPage);
  }
  if (bang?.type === "engine" && !bang.query.trim()) {
    return c.redirect(nojsHome(c), 302);
  }

  const outcome = await _runSearch(c, query, bang, retry);
  if (!outcome) return _notFound(c);

  const tabId = stripTabTypePrefix(query.type || WEB_TAB_ID);
  const currentType = nojsTabType(tabId);
  const isImages = isImageSearchType(tabId);
  const isVideos = resolveBuiltinSearchType(tabId) === VIDEO_SEARCH_TYPE;

  const metaText =
    outcome.results.length === 0
      ? t("nojs.no-results", undefined, locale)
      : t(
          "nojs.results-meta",
          { count: String(outcome.results.length), time: String(outcome.totalTime) },
          locale,
        );
  const meta = renderHtml(<ResultsMeta text={String(metaText)} />);

  const pageTotal =
    outcome.results.length === 0 ? 1 : (outcome.totalPages ?? NOJS_PAGE_TOTAL);

  const slots = await renderNojsSlots(
    query.q.trim(),
    ip,
    outcome.results,
    locale,
    resolveBuiltinSearchType(tabId) || WEB_TAB_ID,
  );

  const html = await buildNojsResultsPage(
    {
      header: await renderNojsResultsHeader(c, query, t, locale),
      tabs: await renderNojsTabRow(c, query, currentType, t, locale),
      meta,
      list: await renderNojsResults(
        outcome.results,
        isImages,
        isVideos,
        t,
        locale,
      ),
      pagination: await renderNojsPagination(
        c,
        query,
        query.page ?? 1,
        pageTotal,
        t,
        locale,
      ),
      sidebar:
        renderNojsKnowledgePanels(slots.knowledgePanels, locale, t) +
        (await renderNojsSidebar(
          c,
          query,
          outcome.engineTimings,
          outcome.canRetry,
          locale,
          t,
        )),
      slots: slots.byContainer,
      mediaMode: isImages,
      footer: await renderNojsFooter(t, locale),
    },
    locale,
  );
  if (!html) return _notFound(c);
  return c.html(html);
});

export default router;
