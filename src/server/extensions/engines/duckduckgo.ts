import * as cheerio from "cheerio";
import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
  SettingField,
} from "../../types";
import { getRandomUserAgent } from "../../utils/user-agents";

function resolveDdgRedirect(href: string): string {
  try {
    const parsed = new URL(href, "https://duckduckgo.com");
    if (parsed.searchParams.has("uddg")) {
      return parsed.searchParams.get("uddg")!;
    }
    if (parsed.pathname.endsWith("/y.js") && parsed.searchParams.has("u")) {
      return parsed.searchParams.get("u")!;
    }
  } catch {
    /* keep original */
  }
  return href;
}

function isDdgInternal(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return (
      hostname === "duckduckgo.com" ||
      hostname.endsWith(".duckduckgo.com")
    );
  } catch {
    return false;
  }
}

const DDG_SAFE_SEARCH_MAP: Record<string, string> = {
  moderate: "-2",
  strict: "1",
};

export class DuckDuckGoEngine implements SearchEngine {
  name = "DuckDuckGo";
  bangShortcut = "ddg";
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
    page?: number,
    timeFilter?: TimeFilter,
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    const offset = ((page || 1) - 1) * 30;
    const lang = context?.lang;
    const params = new URLSearchParams({ q: query });
    if (offset > 0) {
      params.set("s", String(offset));
      params.set("dc", String(offset + 1));
    }
    if (lang && lang !== "en") params.set("kl", `${lang}-${lang}`);
    if (DDG_SAFE_SEARCH_MAP[this.safeSearch]) params.set("kp", DDG_SAFE_SEARCH_MAP[this.safeSearch]);
    if (timeFilter && timeFilter !== "any" && timeFilter !== "custom") {
      const dfMap: Record<string, string> = {
        hour: "h",
        day: "d",
        week: "w",
        month: "m",
        year: "y",
      };
      if (dfMap[timeFilter]) params.set("df", dfMap[timeFilter]);
    }
    const url = `https://html.duckduckgo.com/html/?${params.toString()}`;
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
        Referer: "https://duckduckgo.com/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $(".result").each((_, el) => {
      const titleEl = $(el).find(".result__title a").first();
      const snippetEl = $(el).find(".result__snippet").first();

      const title = titleEl.text().trim();
      let href = titleEl.attr("href") || "";
      const snippet = snippetEl.text().trim();

      href = resolveDdgRedirect(href);

      if (title && href && href.startsWith("http") && !isDdgInternal(href)) {
        results.push({ title, url: href, snippet, source: this.name });
      }
    });

    return results;
  }
}
