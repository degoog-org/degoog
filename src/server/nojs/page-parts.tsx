import type { Context } from "hono";
import { renderHtml } from "../../shared/ui/tribute/html";
import { renderTemplateString } from "../../shared/template/index";
import { escapeAttribute } from "../../shared/ui/tribute/escape";
import type { ScoredResult } from "../../shared/search-types";
import type { Translate } from "../types/extension";
import { asBoolean, asString } from "../utils/settings/plugin-settings";
import { getInstanceSettings } from "../utils/settings/server-settings";
import { HomeFooter } from "./home-footer";
import { HomeFooterLink } from "./home-footer-link";
import { ImageCard } from "./image-card";
import { ImageGrid } from "./image-grid";
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
import { fullAppHref, nojsHome, nojsSearchAction, type NojsQuery } from "./links";
import { buildNojsDocument, loadNojsPartial, loadNojsShell } from "./render";
import { SLOT_CONTAINER_IDS } from "./slots";
import { listNojsTabs } from "./tabs";

const RESULTS_BODY_CLASS = "nojs nojs-results";

const _formMethod = async (): Promise<string> => {
  const settings = await getInstanceSettings();
  return asBoolean(settings.postMethodEnabled) ? "post" : "get";
};

const _searchLabel = (t: Translate, locale: string): string =>
  escapeAttribute(String(t("nojs.search-label", undefined, locale)));

export const renderNojsFooter = async (t: Translate, locale: string): Promise<string> => {
  const template = await loadNojsPartial("home-footer", t, locale);
  if (!template) return "";
  const link = renderHtml(
    <HomeFooterLink
      href={fullAppHref()}
      label={String(t("nojs.full-app", undefined, locale))}
    />,
  );
  const at = template.lastIndexOf("</div>");
  if (at < 0) return template + link;
  return template.slice(0, at) + link + template.slice(at);
};

export const renderNojsHomeSearch = async (
  c: Context,
  t: Translate,
  locale: string,
): Promise<string> => {
  const template = await loadNojsPartial("home-search", t, locale);
  if (!template) return "";
  let html = await removeElementById(template, "btn-lucky");
  html = await setAttributesById(html, "search-form-home", {
    action: escapeAttribute(nojsSearchAction(c)),
    method: await _formMethod(),
    role: "search",
  });
  return await setAttributesById(html, "search-input", {
    "aria-label": _searchLabel(t, locale),
    autofocus: "autofocus",
  });
};

export const renderNojsResultsHeader = async (
  c: Context,
  query: NojsQuery,
  t: Translate,
  locale: string,
): Promise<string> => {
  const template = await loadNojsPartial("search-header", t, locale);
  if (!template) return "";
  let html = await addClassWhereClass(
    template,
    "logo-letter",
    "nojs-logo-letter",
  );
  html = await setAttributesByClass(html, "results-logo", {
    href: escapeAttribute(nojsHome(c)),
  });
  html = await removeElementById(html, "results-search-clear-btn");
  html = await setAttributesById(html, "results-search-input", {
    name: "q",
    value: escapeAttribute(query.q),
    "aria-label": _searchLabel(t, locale),
  });
  html = await setAttributesById(html, "results-search-btn", {
    type: "submit",
  });
  const hidden = query.type
    ? `<input type="hidden" name="type" value="${escapeAttribute(query.type)}" />`
    : "";
  return await wrapElementById(
    html,
    "results-search-bar",
    `<form class="nojs-results-form" action="${escapeAttribute(nojsSearchAction(c))}" method="${await _formMethod()}" role="search">`,
    `${hidden}</form>`,
  );
};

export const renderNojsResults = async (
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
      return renderHtml(
        <ImageCard
          href={String(context.url ?? "")}
          html={renderTemplateString(template, context)}
        />,
      );
    })
    .join("\n");
  return renderHtml(<ImageGrid html={cards} />);
};

export const renderNojsTabRow = async (
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
    method: await _formMethod(),
  });
};

export const renderNojsPagination = async (
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

export interface ResultsPageParts {
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

export const buildNojsResultsPage = async (
  parts: ResultsPageParts,
  locale: string,
): Promise<string | null> => {
  const shell = await loadNojsShell("search");
  if (!shell) return null;

  let html = await fillById(shell, "results-header", parts.header);
  html = await replaceElementById(html, "results-tabs", parts.tabs);
  html = await fillById(html, "results-meta", parts.meta);
  for (const id of Object.values(SLOT_CONTAINER_IDS)) {
    html = await fillById(html, id, parts.slots[id] ?? "");
  }
  html = await fillById(html, "results-list", parts.list);
  html = await fillById(html, "pagination", parts.pagination);
  html = await fillById(html, "results-sidebar", parts.sidebar);
  if (parts.mediaMode) {
    html = await addClassById(html, "results-layout", "media-mode");
  }
  html = await appendToId(
    html,
    "app",
    renderHtml(<HomeFooter html={parts.footer} />),
  );

  return buildNojsDocument(html, locale, RESULTS_BODY_CLASS);
};
