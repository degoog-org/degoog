import { Hono, type Context } from "hono";
import { matchBangCommand, type BangMatch } from "../extensions/commands/registry";
import {
  getDefaultEngineConfig,
  getEngineSearchType,
} from "../extensions/engines/registry";
import { build404 } from "../routes/pages";
import { handleRetry, handleSearch } from "../routes/search/_search-handlers";
import { handleTabSearch } from "../routes/search/_tab-search-handler";
import { parsePage } from "../routes/search/_parsers";
import {
  isImageSearchType,
  resolveBuiltinSearchType,
} from "../../shared/search-types";
import type {
  EngineTiming,
  ScoredResult,
  SearchParams,
  SearchType,
  TimeFilter,
  Translate,
} from "../types";
import { getLocale } from "../utils/hono";
import { logger } from "../utils/logger";
import { hasPinged, strike } from "../utils/link-token";
import { asBoolean, asString } from "../utils/plugin-settings";
import { getClientIp } from "../utils/request";
import { _applyRateLimit, isValidQuery } from "../utils/search";
import { getInstanceSettings } from "../utils/server-settings";
import {
  buildMediaContext,
  buildPaginationContext,
  buildResultContext,
  buildTabsContext,
  buildToolsContext,
  resolveLanguages,
} from "./context";
import {
  addClassById,
  addClassWhereClass,
  appendToId,
  fillById,
  removeElementById,
  replaceElementById,
  setAttributesByClass,
  setAttributesById,
  wrapElementById,
} from "./dom";
import {
  fullAppHref,
  nojsHome,
  nojsSearchAction,
  RETRY_PARAM,
  type NojsQuery,
} from "./links";
import {
  buildNojsDocument,
  getNojsTranslator,
  loadNojsPartial,
  loadNojsShell,
} from "./render";
import { renderNojsCommand } from "./commands";
import { isNojsCssCheckOn, isNojsEnabled } from "./settings";
import { renderNojsKnowledgePanels, renderNojsSidebar } from "./sidebar";
import { renderNojsSlots, SLOT_CONTAINER_IDS } from "./slots";
import { escapeAttribute, renderTemplateString } from "./template";
import {
  ENGINE_TYPE_PREFIX,
  WEB_TAB_ID,
  listNojsTabs,
  nojsTabType,
  stripTabTypePrefix,
} from "./tabs";

const router = new Hono();

const VIDEO_SEARCH_TYPE = "videos";
const HOME_BODY_CLASS = "nojs nojs-home";
const RESULTS_BODY_CLASS = "nojs nojs-results";
const NOJS_PAGE_TOTAL = 10;

interface NojsOutcome {
  results: ScoredResult[];
  totalPages: number;
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

const _readQuery = async (
  c: Context,
): Promise<{ query: NojsQuery; retry: string }> => {
  if (c.req.method !== "POST") {
    return {
      query: {
        q: c.req.query("q") ?? "",
        type: c.req.query("type") || "",
        page: parsePage(c.req.query("page")),
        time: c.req.query("time") || "any",
        lang: c.req.query("lang") || "",
        dateFrom: c.req.query("dateFrom") || "",
        dateTo: c.req.query("dateTo") || "",
      },
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
  const field = (name: string): string => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    query: {
      q: field("q"),
      type: field("type"),
      page: parsePage(field("page")),
      time: field("time") || "any",
      lang: field("lang"),
      dateFrom: field("dateFrom"),
      dateTo: field("dateTo"),
    },
    retry: "",
  };
};

const _postMethod = async (): Promise<string> => {
  const settings = await getInstanceSettings();
  return asBoolean(settings.postMethodEnabled) ? "post" : "get";
};

const _searchLabel = (t: Translate, locale: string): string =>
  escapeAttribute(String(t("nojs.search-label", undefined, locale)));

const _footer = async (t: Translate, locale: string): Promise<string> => {
  const template = await loadNojsPartial("home-footer", t, locale);
  if (!template) return "";
  const link =
    '<a class="home-footer-separator">|</a>' +
    `<a href="${escapeAttribute(fullAppHref())}">` +
    `${escapeAttribute(String(t("nojs.full-app", undefined, locale)))}</a>`;
  const at = template.lastIndexOf("</div>");
  if (at < 0) return template + link;
  return template.slice(0, at) + link + template.slice(at);
};

const _homeSearchForm = async (
  c: Context,
  t: Translate,
  locale: string,
): Promise<string> => {
  const template = await loadNojsPartial("home-search", t, locale);
  if (!template) return "";
  let html = removeElementById(template, "btn-lucky");
  html = setAttributesById(html, "search-form-home", {
    action: escapeAttribute(nojsSearchAction(c)),
    method: await _postMethod(),
    role: "search",
  });
  return setAttributesById(html, "search-input", {
    "aria-label": _searchLabel(t, locale),
    autofocus: "autofocus",
  });
};

const _resultsHeader = async (
  c: Context,
  query: NojsQuery,
  t: Translate,
  locale: string,
): Promise<string> => {
  const template = await loadNojsPartial("search-header", t, locale);
  if (!template) return "";
  let html = addClassWhereClass(template, "logo-letter", "nojs-logo-letter");
  html = setAttributesByClass(html, "results-logo", {
    href: escapeAttribute(nojsHome(c)),
  });
  html = removeElementById(html, "results-search-clear-btn");
  html = setAttributesById(html, "results-search-input", {
    name: "q",
    value: escapeAttribute(query.q),
    "aria-label": _searchLabel(t, locale),
  });
  html = setAttributesById(html, "results-search-btn", { type: "submit" });
  const hidden = query.type
    ? `<input type="hidden" name="type" value="${escapeAttribute(query.type)}" />`
    : "";
  return wrapElementById(
    html,
    "results-search-bar",
    `<form class="nojs-results-form" action="${escapeAttribute(nojsSearchAction(c))}" method="${await _postMethod()}" role="search">`,
    `${hidden}</form>`,
  );
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
    return {
      results: response.results,
      totalPages: response.totalPages ?? 1,
      totalTime: response.totalTime,
      engineTimings: response.engineTimings ?? [],
      canRetry: false,
    };
  }

  const tabId = stripTabTypePrefix(query.type ?? "");

  if (tabId && tabId !== WEB_TAB_ID && !tabId.startsWith(ENGINE_TYPE_PREFIX)) {
    const tabResult = await handleTabSearch({
      tabId,
      query: query.q,
      page: query.page ?? 1,
      clientIp: getClientIp(c),
    });
    if (!tabResult) return null;
    return {
      results: tabResult.results,
      totalPages: tabResult.totalPages,
      totalTime: tabResult.totalTime,
      engineTimings: tabResult.engineTimings,
      canRetry: false,
    };
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
    return {
      results: retried.results,
      totalPages: query.page && query.page > 1 ? query.page : 1,
      totalTime: retried.totalTime,
      engineTimings: retried.engineTimings,
      canRetry: true,
    };
  }

  const response = await handleSearch(params);
  return {
    results: response.results,
    totalPages: response.totalPages ?? 1,
    totalTime: response.totalTime,
    engineTimings: response.engineTimings ?? [],
    canRetry: true,
  };
};

const _renderResults = async (
  results: ScoredResult[],
  isImages: boolean,
  isVideos: boolean,
  t: Translate,
  locale: string,
): Promise<string> => {
  const template = await loadNojsPartial(
    isImages ? "image-card" : "result",
    t,
    locale,
  );
  if (!template) return "";
  if (!isImages) {
    return results
      .map((result, index) =>
        renderTemplateString(
          template,
          buildResultContext(result, locale, index, isVideos, t),
        ),
      )
      .join("\n");
  }
  const cards = results
    .map((result) => {
      const context = buildMediaContext(result);
      const href = escapeAttribute(String(context.url ?? ""));
      return (
        `<a class="image-card" href="${href}" rel="noopener noreferrer">` +
        renderTemplateString(template, context) +
        "</a>"
      );
    })
    .join("\n");
  return `<div class="image-grid">${cards}</div>`;
};

const _renderTabRow = async (
  c: Context,
  query: NojsQuery,
  currentType: string,
  t: Translate,
  locale: string,
): Promise<string> => {
  const template = await loadNojsPartial("tabs", t, locale);
  if (!template) return "";

  const settings = await getInstanceSettings();
  const languages = resolveLanguages(
    asBoolean(settings.languagesEnabled),
    asString(settings.languages ?? ""),
  );
  const tools = buildToolsContext(query, languages, locale, t);
  const tabs = await listNojsTabs(
    String(t("search-templates.tabs.web", undefined, locale)),
  );
  return renderTemplateString(template, {
    ...tools,
    ...buildTabsContext(c, tabs, query, currentType, !!tools.open),
    search_action: nojsSearchAction(c),
    method: await _postMethod(),
  });
};

const _renderPagination = async (
  c: Context,
  query: NojsQuery,
  activePage: number,
  totalPages: number,
  t: Translate,
  locale: string,
): Promise<string> => {
  if (totalPages <= 1) return "";
  const template = await loadNojsPartial("pagination", t, locale);
  if (!template) return "";
  return renderTemplateString(
    template,
    buildPaginationContext(c, query, activePage, totalPages),
  );
};

interface ResultsPageParts {
  header: string;
  tabs: string;
  meta: string;
  list: string;
  pagination: string;
  sidebar: string;
  slots: Record<string, string>;
  mediaMode: boolean;
  footer: string;
}

const _buildResultsPage = async (
  parts: ResultsPageParts,
  locale: string,
): Promise<string | null> => {
  const shell = await loadNojsShell("search");
  if (!shell) return null;

  let html = fillById(shell, "results-header", parts.header);
  html = replaceElementById(html, "results-tabs", parts.tabs);
  html = fillById(html, "results-meta", parts.meta);
  for (const id of Object.values(SLOT_CONTAINER_IDS)) {
    html = fillById(html, id, parts.slots[id] ?? "");
  }
  html = fillById(html, "results-list", parts.list);
  html = fillById(html, "pagination", parts.pagination);
  html = fillById(html, "results-sidebar", parts.sidebar);
  if (parts.mediaMode) html = addClassById(html, "results-layout", "media-mode");
  html = appendToId(html, "app", `<div id="home-footer">${parts.footer}</div>`);

  return buildNojsDocument(html, locale, RESULTS_BODY_CLASS);
};

router.get("/nojs", async (c) => {
  const denied = await _disabled(c);
  if (denied) return denied;

  const locale = getLocale(c) ?? "";
  const t = await getNojsTranslator();
  const shell = await loadNojsShell("index");
  if (!shell) return _notFound(c);

  let content = fillById(
    shell,
    "header",
    (await loadNojsPartial("home-header", t, locale)) ?? "",
  );
  content = fillById(
    content,
    "home-logo",
    addClassWhereClass(
      (await loadNojsPartial("logo", t, locale)) ?? "",
      "logo-letter",
      "nojs-logo-letter",
    ),
  );
  content = fillById(content, "home-search", await _homeSearchForm(c, t, locale));
  content = fillById(content, "home-footer", await _footer(t, locale));

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
    const commandPage = await _buildResultsPage(
      {
        header: await _resultsHeader(c, query, t, locale),
        tabs: "",
        meta: "",
        list: command.html,
        pagination: await _renderPagination(
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
        footer: await _footer(t, locale),
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
  const isImages = isImageSearchType(query.type ?? "");
  const isVideos = resolveBuiltinSearchType(tabId) === VIDEO_SEARCH_TYPE;

  const meta =
    outcome.results.length === 0
      ? `<span>${String(t("nojs.no-results", undefined, locale))}</span>`
      : `<span>${String(
          t(
            "nojs.results-meta",
            { count: String(outcome.results.length), time: String(outcome.totalTime) },
            locale,
          ),
        )}</span>`;

  const slots = await renderNojsSlots(
    query.q.trim(),
    ip,
    outcome.results,
    locale,
    currentType,
  );

  const html = await _buildResultsPage(
    {
      header: await _resultsHeader(c, query, t, locale),
      tabs: await _renderTabRow(c, query, currentType, t, locale),
      meta,
      list: await _renderResults(outcome.results, isImages, isVideos, t, locale),
      pagination: await _renderPagination(
        c,
        query,
        query.page ?? 1,
        NOJS_PAGE_TOTAL,
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
      footer: await _footer(t, locale),
    },
    locale,
  );
  if (!html) return _notFound(c);
  return c.html(html);
});

export default router;
