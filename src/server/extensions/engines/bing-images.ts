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
    const qft: string[] = [];
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
      if (freshMap[timeFilter]) {
        qft.push(`filterui:age-lt${freshMap[timeFilter].toLowerCase()}`);
      }
    }
    const filters = context?.imageFilters;
    if (filters?.size && filters.size !== "any") {
      const sizeMap: Record<string, string> = {
        icon: "filterui:imagesize-small",
        medium: "filterui:imagesize-medium",
        large: "filterui:imagesize-large",
        wallpaper: "filterui:imagesize-wallpaper",
      };
      if (sizeMap[filters.size]) qft.push(sizeMap[filters.size]);
    }
    if (filters?.color && filters.color !== "any") {
      const colorMap: Record<string, string> = {
        color: "filterui:color2-FGcls_COLOR",
        grayscale: "filterui:color2-FGcls_GRAY",
        transparent: "filterui:photo-transparent",
        red: "filterui:color2-FGcls_RED",
        orange: "filterui:color2-FGcls_ORANGE",
        yellow: "filterui:color2-FGcls_YELLOW",
        green: "filterui:color2-FGcls_GREEN",
        teal: "filterui:color2-FGcls_TEAL",
        blue: "filterui:color2-FGcls_BLUE",
        purple: "filterui:color2-FGcls_PURPLE",
        pink: "filterui:color2-FGcls_PINK",
        white: "filterui:color2-FGcls_WHITE",
        gray: "filterui:color2-FGcls_GRAY",
        black: "filterui:color2-FGcls_BLACK",
        brown: "filterui:color2-FGcls_BROWN",
      };
      if (colorMap[filters.color]) qft.push(colorMap[filters.color]);
    }
    if (filters?.type && filters.type !== "any") {
      const typeMap: Record<string, string> = {
        photo: "filterui:photo-photo",
        clipart: "filterui:photo-clipart",
        lineart: "filterui:photo-lineart",
        gif: "filterui:photo-animatedgif",
      };
      if (typeMap[filters.type]) qft.push(typeMap[filters.type]);
    }
    if (filters?.layout && filters.layout !== "any") {
      const layoutMap: Record<string, string> = {
        square: "filterui:aspect-square",
        wide: "filterui:aspect-wide",
        tall: "filterui:aspect-tall",
      };
      if (layoutMap[filters.layout]) qft.push(layoutMap[filters.layout]);
    }
    if (filters?.license && filters.license !== "any") {
      const licenseMap: Record<string, string> = {
        "any-cc": "filterui:license-L2_L3_L4_L5_L6_L7",
        commercial: "filterui:license-L2_L3_L4_L5",
        share: "filterui:license-L2_L3_L6",
      };
      if (licenseMap[filters.license]) qft.push(licenseMap[filters.license]);
    }
    if (qft.length > 0) {
      url += `&qft=${encodeURIComponent(qft.map((entry) => `+${entry}`).join(" "))}`;
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
            imageWidth:
              typeof data.mw === "number"
                ? data.mw
                : typeof data.imgw === "number"
                  ? data.imgw
                  : undefined,
            imageHeight:
              typeof data.mh === "number"
                ? data.mh
                : typeof data.imgh === "number"
                  ? data.imgh
                  : undefined,
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
