import * as cheerio from "cheerio";
import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
  SettingField,
} from "../../types";
import { getRandomUserAgent } from "../../utils/user-agents";

const BASE_URL = "https://search.brave.com/";
const TIME_RANGE_MAP: Record<string, string> = {
  day: "pd",
  week: "pw",
  month: "pm",
  year: "py",
};

function buildCookieString(lang?: string, safeSearch: string = "moderate"): string {
  const parts = [`safesearch=${safeSearch}`, "useLocation=0", "summarizer=0"];
  if (lang && lang !== "en") {
    parts.push(`country=${lang}`, `ui_lang=${lang}-${lang}`);
  } else {
    parts.push("country=us", "ui_lang=en-us");
  }
  return parts.join("; ");
}

export class BraveEngine implements SearchEngine {
  name = "Brave Search";
  bangShortcut = "brave";
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
    const args: Record<string, string> = {
      q: query,
      source: "web",
    };
    if (page > 1) {
      args.offset = String(page - 1);
    }
    if (
      timeFilter &&
      timeFilter !== "any" &&
      timeFilter !== "custom" &&
      TIME_RANGE_MAP[timeFilter]
    ) {
      args.tf = TIME_RANGE_MAP[timeFilter];
    }
    const url = `${BASE_URL}search?${new URLSearchParams(args).toString()}`;

    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept-Encoding": "gzip, deflate",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          context?.buildAcceptLanguage?.() ||
          process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE ||
          "en-US,en;q=0.9",
        Cookie: buildCookieString(context?.lang, this.safeSearch),
      },
      redirect: "follow",
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $('div[data-type="web"]').each((_, el) => {
      const $el = $(el);
      const linkEl = $el.find('a[href^="http"]').first();
      const href = linkEl.attr("href") ?? "";
      const titleEl = $el
        .find('div.search-snippet-title, div[class*="search-snippet-title"]')
        .first();
      const contentEl = $el.find("div.generic-snippet div.content").first();

      try {
        const parsed = new URL(href, BASE_URL);
        if (parsed.origin === new URL(BASE_URL).origin) return;
      } catch {
        return;
      }
      if (!href) return;

      const title = titleEl.text().trim();
      const snippet = contentEl.text().trim();
      if (!title) return;

      const thumbnail = $el
        .find('a[class*="thumbnail"] img[src]')
        .first()
        .attr("src");
      results.push({
        title,
        url: href,
        snippet,
        source: this.name,
        ...(thumbnail ? { thumbnail } : {}),
      });
    });

    return results;
  }
}
