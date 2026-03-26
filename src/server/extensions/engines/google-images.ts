import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
  SettingField,
} from "../../types";
import { getRandomGsaAgent } from "../../utils/user-agents";
import {
  resolveGoogleTbs,
  resolveGoogleCustomDateTbs,
} from "../../utils/google-utils";

interface GoogleImageResult {
  result?: {
    page_title?: string;
    referrer_url?: string;
    site_title?: string;
  };
  original_image?: {
    url?: string;
    width?: number;
    height?: number;
  };
  thumbnail?: {
    url?: string;
  };
}

export class GoogleImagesEngine implements SearchEngine {
  name = "Google Images";
  safeSearch: string = "off";
  settingsSchema: SettingField[] = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "on"],
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
    const ijn = page - 1;
    const params = new URLSearchParams({
      q: query,
      tbm: "isch",
      asearch: "isch",
      async: `_fmt:json,p:1,ijn:${ijn}`,
    });

    const tbs =
      timeFilter === "custom"
        ? resolveGoogleCustomDateTbs(context?.dateFrom, context?.dateTo)
        : resolveGoogleTbs(timeFilter);
    if (tbs) params.set("tbs", tbs);
    if (context?.lang) params.set("hl", context.lang);
    if (this.safeSearch === "on") params.set("safe", "active");

    const ua = getRandomGsaAgent();
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(
      `https://www.google.com/search?${params.toString()}`,
      {
        headers: {
          "User-Agent": ua,
          Accept: "*/*",
          "Accept-Language":
            context?.buildAcceptLanguage?.() ||
            process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE ||
            "en-US,en;q=0.9",
          Cookie: "CONSENT=YES+",
        },
      },
    );

    const text = await response.text();
    const jsonStart = text.indexOf('{"ischj":');
    if (jsonStart < 0) return [];

    const data = JSON.parse(text.substring(jsonStart)) as {
      ischj?: { metadata?: GoogleImageResult[] };
    };
    const metadata = data.ischj?.metadata || [];
    const results: SearchResult[] = [];

    for (const item of metadata) {
      const title = item.result?.page_title?.replace(/<[^>]+>/g, "") || "";
      const url = item.result?.referrer_url || "";
      const thumbnail = item.thumbnail?.url || "";

      if (title && url) {
        results.push({
          title,
          url,
          snippet: item.result?.site_title || "",
          source: this.name,
          thumbnail,
          imageUrl: item.original_image?.url || thumbnail,
        });
      }
    }

    return results;
  }
}
