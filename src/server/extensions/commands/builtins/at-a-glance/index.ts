import * as cheerio from "cheerio";
import {
  SlotPanelPosition,
  TranslateFunction,
  type PluginContext,
  type SettingField,
  type ScoredResult,
  type SlotPlugin,
} from "../../../../types";
import {
  asString,
  getSettings,
  isDisabled,
} from "../../../../utils/plugin-settings";
import type { TtlCache } from "../../../../utils/cache";
import { looksLikeProse, stripSnippetPrefix } from "../../../../utils/text";
import { getRandomUserAgent } from "../../../../utils/user-agents";

const SETTINGS_ID = "slot-at-a-glance";
const WIKIPEDIA_SETTINGS_ID = "slot-wikipedia";
const WIKIPEDIA_HOSTNAME = "wikipedia.org";

let _extractCache!: TtlCache<string>;

const _escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const _isWikipediaUrl = (url: string): boolean => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === WIKIPEDIA_HOSTNAME || host.endsWith(`.${WIKIPEDIA_HOSTNAME}`);
  } catch {
    return false;
  }
};

const _scoreSnippet = (snippet: string, queryTerms: string[]): number => {
  if (!snippet || snippet.length < 20) return 0;
  if (!looksLikeProse(snippet)) return 0;
  const lower = snippet.toLowerCase();
  const termHits = queryTerms.filter((t) => lower.includes(t)).length;
  const densityBonus = termHits / Math.max(queryTerms.length, 1);
  const lengthScore = Math.min(snippet.length / 200, 1);
  return lengthScore * (1 + densityBonus);
};

const _pickBestResult = (
  results: ScoredResult[],
  excludeWikipedia: boolean,
  queryTerms: string[],
): ScoredResult | null => {
  const candidates = excludeWikipedia
    ? results.filter((r) => !_isWikipediaUrl(r.url))
    : results;
  if (candidates.length === 0) return null;
  return candidates.reduce((best, r) =>
    _scoreSnippet(r.snippet, queryTerms) > _scoreSnippet(best.snippet, queryTerms)
      ? r
      : best,
  );
};

type ExcerptMode = "strict" | "full";

const _pushExtractParagraph = (
  found: string[],
  text: string,
  perParaBudget: number,
): void => {
  found.push(
    text.length > perParaBudget ? `${text.slice(0, perParaBudget)}…` : text,
  );
};

const _finalizeExtractJoin = (found: string[], maxLength: number): string => {
  let joined = found.join("\n\n");
  if (joined.length > maxLength) {
    joined = `${joined.slice(0, maxLength)}…`;
  }
  return joined;
};

const _extractFromHtml = (
  html: string,
  queryTerms: string[],
  maxLength: number,
  maxParagraphs: number,
  excerptMode: ExcerptMode,
): string | null => {
  const sepCost = Math.max(0, maxParagraphs - 1) * 2;
  const perParaBudget = Math.max(
    1,
    Math.floor((maxLength - sepCost) / maxParagraphs),
  );

  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside").remove();
  const root = $("article, main, [role='main']").first();
  const scope = root.length ? root : $("body");
  const found: string[] = [];

  if (excerptMode === "strict") {
    scope.find("p").each((_i, el) => {
      if (found.length >= maxParagraphs) return false;
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length < 60) return;
      if (!looksLikeProse(text)) return;
      const lower = text.toLowerCase();
      if (queryTerms.some((t) => lower.includes(t))) {
        _pushExtractParagraph(found, text, perParaBudget);
      }
    });
    return found.length > 0 ? _finalizeExtractJoin(found, maxLength) : null;
  }

  let anchored = false;
  scope.find("p").each((_i, el) => {
    if (found.length >= maxParagraphs) return false;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length < 60) return;
    if (!looksLikeProse(text)) return;
    const lower = text.toLowerCase();
    if (!anchored) {
      if (queryTerms.some((t) => lower.includes(t))) {
        _pushExtractParagraph(found, text, perParaBudget);
        anchored = true;
      }
      return;
    }
    _pushExtractParagraph(found, text, perParaBudget);
  });
  return found.length > 0 ? _finalizeExtractJoin(found, maxLength) : null;
};

const _extractCacheKey = (
  url: string,
  excerptMode: ExcerptMode,
  maxLength: number,
  maxParagraphs: number,
  queryTerms: string[],
): string => {
  const termsKey = [...queryTerms].sort().join("\x1f");
  return `${url}\x1e${excerptMode}\x1e${maxLength}\x1e${maxParagraphs}\x1e${termsKey}`;
};

const _fetchExtract = async (
  url: string,
  queryTerms: string[],
  maxLength: number,
  maxParagraphs: number,
  excerptMode: ExcerptMode,
  timeoutMs: number,
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<string | null> => {
  const cacheKey = _extractCacheKey(
    url,
    excerptMode,
    maxLength,
    maxParagraphs,
    queryTerms,
  );
  const cached = _extractCache.get(cacheKey);
  if (cached !== null) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      signal: controller.signal,
      headers: { "User-Agent": getRandomUserAgent(), Accept: "text/html" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;
    const html = await res.text();
    const extracted = _extractFromHtml(
      html,
      queryTerms,
      maxLength,
      maxParagraphs,
      excerptMode,
    );
    if (extracted) _extractCache.set(cacheKey, extracted);
    return extracted;
  } catch {
    clearTimeout(timer);
    return null;
  }
};

const _loadSettings = async () => {
  const stored = await getSettings(SETTINGS_ID);
  const rawLength = parseInt(asString(stored["snippetLength"]), 10);
  const rawTimeout = parseFloat(asString(stored["fetchTimeoutSeconds"]) || "3");
  const rawParagraphs = parseInt(asString(stored["paragraphs"]) || "1", 10);
  const rawMode = asString(stored["excerptMode"]).toLowerCase();
  const excerptMode: ExcerptMode = rawMode === "strict" ? "strict" : "full";

  return {
    maxLength:
      Number.isFinite(rawLength) && rawLength > 0
        ? Math.max(100, rawLength)
        : 400,
    fetchContent: asString(stored["fetchContent"]) !== "false",
    fetchTimeoutMs: Number.isFinite(rawTimeout)
      ? Math.max(1, Math.min(rawTimeout, 30)) * 1000
      : 3_000,
    maxParagraphs: Number.isFinite(rawParagraphs)
      ? Math.max(1, Math.min(rawParagraphs, 5))
      : 1,
    excerptMode,
  };
};

const atAGlanceSlot: SlotPlugin = {
  id: "at-a-glance",
  settingsId: SETTINGS_ID,
  name: "At a Glance",
  get description(): string {
    return this.t!("at-a-glance.description");
  },
  position: SlotPanelPosition.AtAGlance,
  waitForResults: true,

  t: TranslateFunction,

  init(ctx: PluginContext): void {
    _extractCache = ctx.createCache<string>(60 * 60 * 1000);
  },

  trigger(): boolean {
    return true;
  },

  settingsSchema: [
    {
      key: "snippetLength",
      label: "Snippet length",
      type: "number",
      default: "400",
      placeholder: "400",
      description:
        "Maximum characters for the combined snippet (paragraphs share this budget). At least 100; otherwise uses your number, or 400 if unset or invalid.",
    },
    {
      key: "paragraphs",
      label: "Paragraphs",
      type: "select",
      options: ["1", "2", "3", "4", "5"],
      default: "1",
      description:
        "Number of paragraphs to extract from the page. More gives more context but takes more space.",
    },
    {
      key: "excerptMode",
      label: "Excerpt mode",
      type: "select",
      options: ["full", "strict"],
      default: "full",
      description:
        "Full: first paragraph must match the query, following won't need to. Strict: every paragraph must match the query.",
    },
    {
      key: "fetchContent",
      label: "Fetch page content",
      type: "toggle",
      default: "true",
      description:
        "Fetch the actual page for richer content. Disable to use search snippets only (faster).",
    },
    {
      key: "fetchTimeoutSeconds",
      label: "Fetch timeout (seconds)",
      type: "number",
      default: "3",
      placeholder: "3",
      description:
        "How long to wait for the page fetch before falling back to the search snippet.",
      advanced: true,
    },
  ] as SettingField[],

  async execute(query: string, context): Promise<{ html: string }> {
    const results = context?.results ?? [];
    if (results.length === 0) return { html: "" };

    const [settings, wikipediaDisabled] = await Promise.all([
      _loadSettings(),
      isDisabled(WIKIPEDIA_SETTINGS_ID),
    ]);

    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const best = _pickBestResult(results, !wikipediaDisabled, queryTerms);
    if (!best) return { html: "" };

    let snippet = looksLikeProse(best.snippet)
      ? stripSnippetPrefix(best.snippet)
      : "";

    if (settings.fetchContent && context?.fetch) {
      const extracted = await _fetchExtract(
        best.url,
        queryTerms,
        settings.maxLength,
        settings.maxParagraphs,
        settings.excerptMode,
        settings.fetchTimeoutMs,
        context.fetch,
      );
      if (extracted) snippet = extracted;
    }

    if (!snippet) return { html: "" };

    if (snippet.length > settings.maxLength) {
      snippet = `${snippet.slice(0, settings.maxLength)}…`;
    }

    const foundOn = this.t!("at-a-glance.found-on", {
      sources_text: best.sources.join(", "),
    });

    return {
      html:
        '<div class="glance-box">' +
        `<div class="glance-snippet">${_escapeHtml(snippet)}</div>` +
        `<a class="glance-link" href="${_escapeHtml(best.url)}" target="_blank">${_escapeHtml(best.title)}</a>` +
        `<div class="glance-sources">${_escapeHtml(foundOn)}</div>` +
        "</div>",
    };
  },
};

export const slot = atAGlanceSlot;
