import * as cheerio from "cheerio";
import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
} from "../../types";
import { getRandomUserAgent } from "../../utils/user-agents";

const TIME_RANGE_MAP: Record<string, string> = {
  hour: 'ex1:"ez1"',
  day: 'ex1:"ez2"',
  week: 'ex1:"ez3"',
  month: 'ex1:"ez5"',
};

export class BingNewsEngine implements SearchEngine {
  name = "Bing News";
  bangShortcut = "bingnews";

  async executeSearch(
    query: string,
    page: number = 1,
    timeFilter?: TimeFilter,
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    const offset = (page - 1) * 10;
    const lang = context?.lang;
    const params = new URLSearchParams({ q: query, form: "NSBABR" });
    if (lang) params.set("setlang", lang);
    if (offset > 0) params.set("first", String(offset + 1));
    if (
      timeFilter &&
      timeFilter !== "any" &&
      timeFilter !== "custom" &&
      TIME_RANGE_MAP[timeFilter]
    ) {
      params.set("qft", TIME_RANGE_MAP[timeFilter]);
    }

    const url = `https://www.bing.com/news/search?${params}`;
    const doFetch = context?.fetch ?? fetch;
    const res = await doFetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          context?.buildAcceptLanguage?.() ||
          process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE ||
          "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $(".news-card").each((_, el) => {
      const $el = $(el);
      const href =
        $el.attr("url") ||
        $el.attr("data-url") ||
        $el.find("a[href^='http']").first().attr("href") ||
        "";
      if (!href || !href.startsWith("http")) return;

      const title =
        $el.find(".title").text().trim() || $el.find("a.title").text().trim();
      const snippet = $el.find(".snippet").text().trim();
      const imgEl = $el.find("img").first();
      const thumbnail = imgEl.attr("src") || imgEl.attr("data-src") || "";

      if (title) {
        results.push({
          title,
          url: href,
          snippet,
          source: this.name,
          ...(thumbnail && thumbnail.startsWith("http") ? { thumbnail } : {}),
        });
      }
    });

    return results;
  }
}
