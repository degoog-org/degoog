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
    const adlt =
      this.safeSearch === "strict" || this.safeSearch === "moderate"
        ? this.safeSearch
        : "off";
    url += `&adlt=${adlt}`;
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
    const seen = new Set<string>();

    $(".mc_vtvc").each((_, el) => {
      const $el = $(el);

      const mmeta = $el.attr("mmeta") || "";
      let videoUrl = "";
      let thumbnail = "";

      if (mmeta) {
        try {
          const data = JSON.parse(mmeta) as Record<string, string>;
          videoUrl = data.murl || data.pgurl || "";
          thumbnail = data.turl || "";
        } catch {}
      }

      const title = $el.find(".mc_vtvc_title").first().text().trim();

      if (!thumbnail) {
        const img = $el.find("img").first();
        thumbnail = img.attr("data-src-hq") || img.attr("src") || "";
      }

      let duration = "";
      $el.find(".mc_vtvc_meta_row").each((__, row) => {
        if (duration) return;
        const text = $(row).text().trim();
        if (/^\d{1,3}:\d{2}(:\d{2})?$/.test(text)) duration = text;
      });

      if (!title || !videoUrl || seen.has(videoUrl)) return;
      seen.add(videoUrl);

      results.push({ title, url: videoUrl, snippet: "", source: this.name, thumbnail, duration });
    });

    return results;
  }
}
