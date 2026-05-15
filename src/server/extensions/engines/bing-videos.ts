import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
  SettingField,
} from "../../types";
import { getRandomUserAgent } from "../../utils/user-agents";

const BING_VIDEO_RESULTS_SCP = '[data-svcptid="VideoResults"]';

const parseMmetaObject = (raw: string): Record<string, string> | null => {
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
};

const readBingVideoTileTitle = ($tile: cheerio.Cheerio<Element>): string => {
  const aria = $tile.find("a[aria-label]").first().attr("aria-label")?.trim();
  if (aria) {
    const head = aria.split(/\bfrom\s+/i)[0]?.trim() ?? aria;
    return head.replace(/^[\s"'“‘]+|[\s"'”’]+$/g, "").trim();
  }
  const titled = $tile.find("[title]").not("img").first().attr("title")?.trim();
  if (titled) return titled;
  return $tile.text().replace(/\s+/g, " ").trim();
};

const readBingVideoTileDuration = ($tile: cheerio.Cheerio<Element>): string => {
  const hit = $tile.text().match(/\b\d{1,3}:\d{2}(:\d{2})?\b/);
  return hit?.[0] ?? "";
};

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

  configure(settings: Record<string, string | string[] | boolean>): void {
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
    const pageSize = 40;
    const first = (page - 1) * pageSize;
    const lang = context?.lang;
    let url = `https://www.bing.com/videos/search?q=${encodeURIComponent(query)}&count=${pageSize}&first=${first}&FORM=HDRSC3`;
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
    const seen = new Set<string>();

    const $tiles = $(BING_VIDEO_RESULTS_SCP).find("[mmeta]");
    $tiles.each((_, el) => {
      const $el = $(el);
      const mmeta = $el.attr("mmeta") ?? "";
      const data = parseMmetaObject(mmeta);
      const videoUrl = data?.murl || data?.pgurl || "";
      if (!videoUrl.startsWith("http")) return;

      let thumbnail = data?.turl ?? "";
      if (!thumbnail) {
        const img = $el.find("img").first();
        thumbnail = img.attr("data-src-hq") || img.attr("src") || "";
      }

      const title = readBingVideoTileTitle($el);
      const duration = readBingVideoTileDuration($el);

      if (!title || seen.has(videoUrl)) return;
      seen.add(videoUrl);

      results.push({
        title,
        url: videoUrl,
        snippet: "",
        source: this.name,
        thumbnail,
        duration,
      });
    });

    return results;
  }
}
