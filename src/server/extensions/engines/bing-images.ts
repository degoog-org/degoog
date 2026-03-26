import * as cheerio from "cheerio";
import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
  SettingField,
} from "../../types";
import { getRandomUserAgent } from "../../utils/user-agents";

export class BingImagesEngine implements SearchEngine {
  name = "Bing Images";
  safeSearch: string = "off";
  settingsSchema: SettingField[] = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
      description: "Filter explicit content from image results.",
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
    const first = (page - 1) * 60;
    const lang = context?.lang;
    let url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&count=60&first=${first}`;
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
        url += `&qft=+filterui:age-lt${freshMap[timeFilter].toLowerCase()}`;
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

    $(".iusc, .imgpt").each((_, el) => {
      const meta = $(el).attr("m") || $(el).find("a.iusc").attr("m") || "";
      try {
        const data = JSON.parse(meta);
        if (data.murl && data.turl) {
          results.push({
            title: data.t || data.desc || "",
            url: data.purl || data.murl,
            snippet: data.desc || "",
            source: this.name,
            thumbnail: data.turl,
            imageUrl: data.murl,
          });
        }
      } catch {}
    });

    if (results.length === 0) {
      $("a.thumb").each((_, el) => {
        const href = $(el).attr("href") || "";
        const img = $(el).find("img");
        const thumbnail = img.attr("src") || img.attr("data-src") || "";
        const title = img.attr("alt") || "";
        if (thumbnail && title) {
          results.push({
            title,
            url: href.startsWith("http") ? href : `https://www.bing.com${href}`,
            snippet: "",
            source: this.name,
            thumbnail,
          });
        }
      });
    }

    return results;
  }
}
