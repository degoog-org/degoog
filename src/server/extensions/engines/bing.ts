import * as cheerio from "cheerio";
import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
  SettingField,
} from "../../types";
import { getRandomUserAgent } from "../../utils/user-agents";

export class BingEngine implements SearchEngine {
  name = "Bing";
  bangShortcut = "b";
  safeSearch: string = "off";
  settingsSchema: SettingField[] = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
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
    const first = (page - 1) * 50;
    const lang = context?.lang;
    let url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=50&first=${first}`;
    if (lang) url += `&setlang=${lang}`;
    if (this.safeSearch !== "off") url += `&adlt=${this.safeSearch}`;
    if (timeFilter && timeFilter !== "any" && timeFilter !== "custom") {
      const freshMap: Record<string, string> = {
        hour: "Hour",
        day: "Day",
        week: "Week",
        month: "Month",
        year: "Year",
      };
      if (freshMap[timeFilter])
        url += `&filters=ex1%3a"ez5_${freshMap[timeFilter]}_TimeCustom"`;
    } else if (
      timeFilter === "custom" &&
      (context?.dateFrom || context?.dateTo)
    ) {
      const from = context?.dateFrom ?? "";
      const to = context?.dateTo ?? "";
      url += `&filters=${encodeURIComponent(`ex1:"ez5_Custom_TimeCustom" ex2:"CustomDate|${from}_${to}"`)}`;
    }
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language":
          context?.buildAcceptLanguage?.() ||
          process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE ||
          "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    const resultItems =
      $("li.b_algo").length > 0 ? $("li.b_algo") : $('li[class*="b_algo"]');

    resultItems.each((_, el) => {
      const titleEl = $(el).find("h2 a").first();
      const snippetEl = $(el).find(".b_caption p").first();

      const title = titleEl.text().trim();
      const href = titleEl.attr("href") || "";
      const snippet = snippetEl.text().trim();

      if (title && href && href.startsWith("http")) {
        results.push({ title, url: href, snippet, source: this.name });
      }
    });

    if (results.length === 0) {
      $("#b_results li, main li").each((_, el) => {
        const $li = $(el);
        const titleEl = $li.find("h2 a").first();
        const href = titleEl.attr("href") || "";
        const title = titleEl.text().trim();
        if (title && href && href.startsWith("http")) {
          const snippetEl = $li.find("p").first();
          results.push({
            title,
            url: href,
            snippet: snippetEl.text().trim(),
            source: this.name,
          });
        }
      });
    }

    return results;
  }
}
