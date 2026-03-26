import * as cheerio from "cheerio";
import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
  SettingField,
} from "../../types";
import { getRandomUserAgent } from "../../utils/user-agents";

const TIME_RANGE_MAP: Record<string, string> = {
  day: "pd",
  week: "pw",
  month: "pm",
  year: "py",
};

export class BraveNewsEngine implements SearchEngine {
  name = "Brave News";
  bangShortcut = "bravenews";
  safeSearch: string = "moderate";
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
    if (!query.trim()) return [];

    const params: Record<string, string> = { q: query };
    if (page > 1) params.offset = String(page - 1);
    if (
      timeFilter &&
      timeFilter !== "any" &&
      timeFilter !== "custom" &&
      TIME_RANGE_MAP[timeFilter]
    ) {
      params.tf = TIME_RANGE_MAP[timeFilter];
    }

    const lang = context?.lang;
    const cookie =
      lang && lang !== "en"
        ? `safesearch=${this.safeSearch}; useLocation=0; country=${lang}; ui_lang=${lang}-${lang}`
        : `safesearch=${this.safeSearch}; useLocation=0; country=us; ui_lang=en-us`;

    const url = `https://search.brave.com/news?${new URLSearchParams(params)}`;
    const doFetch = context?.fetch ?? fetch;
    const res = await doFetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept-Encoding": "gzip, deflate",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          context?.buildAcceptLanguage?.() ||
          process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE ||
          "en-US,en;q=0.9",
        Cookie: cookie,
      },
      redirect: "follow",
    });

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $("div.snippet[data-type='news'], div[data-type='news']").each((_, el) => {
      const $el = $(el);
      const linkEl = $el.find("a[href^='http']").first();
      const href = linkEl.attr("href") ?? "";
      if (!href) return;

      try {
        const parsed = new URL(href, "https://search.brave.com");
        if (parsed.hostname === "search.brave.com") return;
      } catch {
        return;
      }

      const title =
        $el
          .find(
            "span.snippet-title, .snippet-title, div[class*='snippet-title']",
          )
          .text()
          .trim() || linkEl.text().trim();
      const snippet = $el
        .find(
          ".snippet-description, .snippet-content, div[class*='snippet-description']",
        )
        .text()
        .trim();
      const thumbnail = $el
        .find("img.thumb, img[src^='http']")
        .first()
        .attr("src");

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
