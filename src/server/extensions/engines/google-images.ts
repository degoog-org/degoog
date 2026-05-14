import type {
  EngineContext,
  ImageFilter,
  SearchEngine,
  SearchResult,
  SettingField,
  TimeFilter,
} from "../../types";
import { getRandomGsaAgent } from "../../utils/user-agents";
import {
  resolveGoogleCustomDateTbs,
  resolveGoogleTbs,
} from "../../utils/google-utils";

const GOOGLE_SIZE_MAP: Record<string, string> = {
  small: "imgsz:small",
  medium: "imgsz:medium",
  large: "imgsz:large",
  wallpaper: "imgsz:xlarge",
};

const GOOGLE_COLOR_MAP: Record<string, string> = {
  monochrome: "ic:gray",
  red: "ic:specific,isc:red",
  orange: "ic:specific,isc:orange",
  yellow: "ic:specific,isc:yellow",
  green: "ic:specific,isc:green",
  teal: "ic:specific,isc:teal",
  blue: "ic:specific,isc:blue",
  purple: "ic:specific,isc:purple",
  pink: "ic:specific,isc:pink",
  white: "ic:specific,isc:white",
  gray: "ic:specific,isc:gray",
  brown: "ic:specific,isc:brown",
  black: "ic:specific,isc:black",
};

const GOOGLE_TYPE_MAP: Record<string, string> = {
  photo: "itp:photo",
  clipart: "itp:clipart",
  lineart: "itp:lineart",
  animated: "itp:animated",
};

const GOOGLE_LAYOUT_MAP: Record<string, string> = {
  square: "iar:s",
  wide: "iar:w",
  tall: "iar:t",
};

const buildImgTbs = (imgFilter?: ImageFilter): string => {
  const parts: string[] = [];
  if (imgFilter?.size && imgFilter.size !== "any" && GOOGLE_SIZE_MAP[imgFilter.size]) {
    parts.push(GOOGLE_SIZE_MAP[imgFilter.size]);
  }
  if (imgFilter?.color && imgFilter.color !== "any" && GOOGLE_COLOR_MAP[imgFilter.color]) {
    parts.push(GOOGLE_COLOR_MAP[imgFilter.color]);
  }
  if (imgFilter?.type && imgFilter.type !== "any" && GOOGLE_TYPE_MAP[imgFilter.type]) {
    parts.push(GOOGLE_TYPE_MAP[imgFilter.type]);
  }
  if (imgFilter?.layout && imgFilter.layout !== "any" && GOOGLE_LAYOUT_MAP[imgFilter.layout]) {
    parts.push(GOOGLE_LAYOUT_MAP[imgFilter.layout]);
  }
  return parts.join(",");
};

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
  name = "Google Images (NEEDS FPLAY TRANSPORT)";
  safeSearch: string = "off";
  disabledByDefault: boolean = true;
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

    const timeTbs =
      timeFilter === "custom"
        ? resolveGoogleCustomDateTbs(context?.dateFrom, context?.dateTo)
        : resolveGoogleTbs(timeFilter);
    const imgTbs = buildImgTbs(context?.imageFilter);
    const tbs = [timeTbs, imgTbs].filter(Boolean).join(",");
    if (tbs) params.set("tbs", tbs);
    if (context?.lang) params.set("hl", context.lang);
    const nsfwOverride = context?.imageFilter?.nsfw;
    if (nsfwOverride === "on") params.set("safe", "active");
    else if (nsfwOverride === "off") params.delete("safe");
    else if (this.safeSearch === "on") params.set("safe", "active");

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
