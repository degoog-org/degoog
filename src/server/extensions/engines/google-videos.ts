import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
  SettingField,
} from "../../types";
import { getRandomGsaAgent } from "../../utils/user-agents";
import {
  resolveGoogleTbs,
  resolveGoogleCustomDateTbs,
  resolveGoogleHref,
} from "../../utils/google-utils";

const _DURATION_RE = /^\d{1,3}:\d{2}$|^\d{1,3}:\d{2}:\d{2}$/;

const _ytThumbnail = (href: string): string => {
  const match = href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
  return match ? `https://i.ytimg.com/vi/${match[1]}/mqdefault.jpg` : "";
};

const _durationFromScope = (
  $: cheerio.CheerioAPI,
  $scope: cheerio.Cheerio<AnyNode>,
): string => {
  let found = "";
  $scope.find("span").each((_i: number, node: AnyNode) => {
    if (found) return;
    const t = $(node).text().trim();
    if (_DURATION_RE.test(t)) found = t;
  });
  return found;
};

export class GoogleVideosEngine implements SearchEngine {
  name = "Google Videos";
  safeSearch: string = "off";
  settingsSchema: SettingField[] = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "on"],
      description: "Filter explicit content from video results.",
    },
  ];

  configure(settings: Record<string, string | string[]>): void {
    if (typeof settings.safeSearch === "string") {
      this.safeSearch = settings.safeSearch;
    }
  }

  async executeSearch(
    query: string,
    page: number = 1,
    timeFilter?: TimeFilter,
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    const start = (page - 1) * 10;
    const lang = context?.lang || "en";
    const params = new URLSearchParams({
      q: query,
      tbm: "vid",
      hl: lang,
      lr: `lang_${lang}`,
      ie: "utf8",
      oe: "utf8",
      start: String(start),
      filter: "0",
    });

    const tbs =
      timeFilter === "custom"
        ? resolveGoogleCustomDateTbs(context?.dateFrom, context?.dateTo)
        : resolveGoogleTbs(timeFilter);
    if (tbs) params.set("tbs", tbs);
    if (this.safeSearch === "on") params.set("safe", "active");

    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(
      `https://www.google.com/search?${params.toString()}`,
      {
        headers: {
          "User-Agent": getRandomGsaAgent(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language":
            context?.buildAcceptLanguage?.() ||
            process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE ||
            "en-US,en;q=0.9",
          Cookie: "CONSENT=YES+",
        },
        redirect: "follow",
      },
    );

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const seen = new Set<string>();
    const sourceName = this.name;

    const pushVideo = (
      title: string,
      href: string,
      snippet: string,
      $scope: cheerio.Cheerio<AnyNode>,
    ): void => {
      const resolved = resolveGoogleHref(href);
      if (
        !title ||
        !resolved ||
        !resolved.startsWith("http") ||
        resolved.includes("google.com/search") ||
        seen.has(resolved)
      ) {
        return;
      }
      seen.add(resolved);
      results.push({
        title,
        url: resolved,
        snippet,
        source: sourceName,
        thumbnail: _ytThumbnail(resolved),
        duration: $scope.length ? _durationFromScope($, $scope) : "",
      });
    };

    $('a[href^="/url?q="]').each((_, el) => {
      const linkEl = $(el);
      const title =
        linkEl.find("h3").first().text().trim() ||
        linkEl.find("span").first().text().trim();
      const href = linkEl.attr("href") || "";
      const snippet = linkEl.parent().next("div").text().trim();
      const block = linkEl.closest("[data-hveid]");
      const scope = block.length ? block : linkEl.parent();
      pushVideo(title, href, snippet, scope);
    });

    if (results.length === 0) {
      $("[data-hveid] a[href]").each((_, el) => {
        const linkEl = $(el);
        const block = linkEl.closest("[data-hveid]");
        const title =
          linkEl.find("h3").first().text().trim() ||
          block.find("[role='link']").first().text().trim();
        const href = linkEl.attr("href") || "";
        const snippet = block.find("[data-sncf]").first().text().trim();
        pushVideo(title, href, snippet, block);
      });
    }

    return results;
  }
}
