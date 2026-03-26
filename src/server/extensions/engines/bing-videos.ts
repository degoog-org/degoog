import * as cheerio from "cheerio";
import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
  SettingField,
} from "../../types";
import { getRandomUserAgent } from "../../utils/user-agents";

export class BingVideosEngine implements SearchEngine {
  name = "Bing Videos";
  safeSearch: string = "off";
  settingsSchema: SettingField[] = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "moderate", "strict"],
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
    const first = (page - 1) * 40;
    const lang = context?.lang;
    let url = `https://www.bing.com/videos/search?q=${encodeURIComponent(query)}&count=40&first=${first}`;
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
        url += `&qft=+filterui:videoage-lt${freshMap[timeFilter].toLowerCase()}`;
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

    $(".mc_vtvc, .dg_u").each((_, el) => {
      const meta =
        $(el).attr("data-video") ||
        $(el).find("[data-video]").attr("data-video") ||
        "";
      try {
        const data = JSON.parse(meta);
        if (data.murl || data.vurl) {
          results.push({
            title: data.title || data.t || "",
            url: data.murl || data.vurl || "",
            snippet: data.desc || "",
            source: this.name,
            thumbnail: data.turl || data.imgurl || "",
            duration: data.dur || "",
          });
        }
      } catch {}
    });

    if (results.length === 0) {
      $(".mc_vtvc_meta, .vrhdata").each((_, el) => {
        const title = $(el)
          .find(".mc_vtvc_title, .mc_vtvc_meta_row")
          .text()
          .trim();
        const link = $(el).closest("a").attr("href") || "";
        const thumb = $(el).closest(".mc_vtvc").find("img").attr("src") || "";
        if (title && link) {
          results.push({
            title,
            url: link.startsWith("http") ? link : `https://www.bing.com${link}`,
            snippet: "",
            source: this.name,
            thumbnail: thumb,
          });
        }
      });
    }

    return results;
  }
}
