import * as cheerio from "cheerio";
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

export class GoogleEngine implements SearchEngine {
  name = "Google";
  bangShortcut = "g";
  safeSearch: string = "off";
  settingsSchema: SettingField[] = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "on"],
      description: "Filter explicit content from search results.",
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

    const url = `https://www.google.com/search?${params.toString()}`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
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
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    const pushResult = (
      title: string,
      href: string,
      snippet: string,
    ): boolean => {
      const resolvedHref = resolveGoogleHref(href);

      if (
        title &&
        resolvedHref &&
        resolvedHref.startsWith("http") &&
        !resolvedHref.includes("google.com/search")
      ) {
        results.push({ title, url: resolvedHref, snippet, source: this.name });
        return true;
      }
      return false;
    };

    $('a[href^="/url?q="]').each((_, el) => {
      const linkEl = $(el);
      const title = linkEl.find("span").first().text().trim();
      const href = linkEl.attr("href") || "";
      const snippet = linkEl.parent().next("div").text().trim();
      pushResult(title, href, snippet);
    });

    if (results.length === 0) {
      $("[data-hveid] a[href]").each((_, el) => {
        const linkEl = $(el);
        const title =
          linkEl.find("h3").first().text().trim() ||
          linkEl
            .closest("[data-hveid]")
            .find("[role='link']")
            .first()
            .text()
            .trim();
        const href = linkEl.attr("href") || "";
        const snippet = linkEl
          .closest("[data-hveid]")
          .find("[data-sncf]")
          .first()
          .text()
          .trim();
        pushResult(title, href, snippet);
      });
    }

    return results;
  }
}
