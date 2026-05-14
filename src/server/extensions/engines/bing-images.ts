import * as cheerio from "cheerio";
import type {
  EngineContext,
  ImageFilter,
  SearchEngine,
  SearchResult,
  SettingField,
  TimeFilter,
} from "../../types";
import { getRandomUserAgent } from "../../utils/user-agents";

const ASYNC_PAGE_SIZE = 35;

const BING_SIZE_MAP: Record<string, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  wallpaper: "Wallpaper",
};

const BING_COLOR_MAP: Record<string, string> = {
  monochrome: "BW",
  red: "FGcls_RED",
  orange: "FGcls_ORANGE",
  yellow: "FGcls_YELLOW",
  green: "FGcls_GREEN",
  teal: "FGcls_TEAL",
  blue: "FGcls_BLUE",
  purple: "FGcls_PURPLE",
  pink: "FGcls_PINK",
  white: "FGcls_WHITE",
  gray: "FGcls_GRAY",
  brown: "FGcls_BROWN",
  black: "FGcls_BLACK",
};

const BING_TYPE_MAP: Record<string, string> = {
  photo: "photo",
  clipart: "clipart",
  lineart: "linedrawing",
  animated: "animatedgif",
};

const BING_LAYOUT_MAP: Record<string, string> = {
  square: "Square",
  wide: "Wide",
  tall: "Tall",
};

const buildBingQft = (timeFilter?: TimeFilter, imgFilter?: ImageFilter): string => {
  const parts: string[] = [];
  if (timeFilter && timeFilter !== "any" && timeFilter !== "custom") {
    const freshMap: Record<string, string> = {
      hour: "Hour", day: "Day", week: "Week", month: "Month", year: "Year",
    };
    if (freshMap[timeFilter]) parts.push(`filterui:age-lt${freshMap[timeFilter].toLowerCase()}`);
  }
  if (imgFilter?.size && imgFilter.size !== "any" && BING_SIZE_MAP[imgFilter.size]) {
    parts.push(`filterui:imagesize-${BING_SIZE_MAP[imgFilter.size]}`);
  }
  if (imgFilter?.color && imgFilter.color !== "any" && BING_COLOR_MAP[imgFilter.color]) {
    parts.push(`filterui:color2-${BING_COLOR_MAP[imgFilter.color]}`);
  }
  if (imgFilter?.type && imgFilter.type !== "any" && BING_TYPE_MAP[imgFilter.type]) {
    parts.push(`filterui:photo-${BING_TYPE_MAP[imgFilter.type]}`);
  }
  if (imgFilter?.layout && imgFilter.layout !== "any" && BING_LAYOUT_MAP[imgFilter.layout]) {
    parts.push(`filterui:aspect-${BING_LAYOUT_MAP[imgFilter.layout]}`);
  }
  return parts.length > 0 ? `+${parts.join("+")}` : "";
};

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
    const first = (page - 1) * ASYNC_PAGE_SIZE;
    const lang = context?.lang;
    let url = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&async=content&count=${ASYNC_PAGE_SIZE}&first=${first}`;
    if (lang) url += `&setlang=${lang}`;
    const nsfwOverride = context?.imageFilter?.nsfw;
    let adlt = this.safeSearch === "strict" || this.safeSearch === "moderate" ? this.safeSearch : "off";
    if (nsfwOverride === "on") adlt = "strict";
    else if (nsfwOverride === "moderate") adlt = "moderate";
    else if (nsfwOverride === "off") adlt = "off";
    url += `&adlt=${adlt}`;
    const qft = buildBingQft(timeFilter, context?.imageFilter);
    if (qft) url += `&qft=${qft}`;
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

    $("a.iusc").each((_, el) => {
      const meta = $(el).attr("m") || "";
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
      } catch { }
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
