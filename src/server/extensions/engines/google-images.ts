import type {
  SearchEngine,
  ImageFilters,
  SearchResult,
  TimeFilter,
  EngineContext,
} from "../../types";
import { getRandomGsaAgent } from "../../utils/user-agents";
import { resolveGoogleTbs } from "../../utils/google-helpers";

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

function buildGoogleImageTbs(
  timeFilter?: TimeFilter,
  imageFilters?: ImageFilters,
): string | null {
  const parts: string[] = [];
  const timeTbs = resolveGoogleTbs(timeFilter);
  if (timeTbs) parts.push(timeTbs);

  if (imageFilters) {
    const sizeMap: Record<string, string> = {
      icon: "isz:i",
      medium: "isz:m",
      large: "isz:l",
      wallpaper: "isz:lt,islt:xga",
    };
    const colorMap: Record<string, string> = {
      color: "ic:color",
      grayscale: "ic:gray",
      transparent: "ic:trans",
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
      black: "ic:specific,isc:black",
      brown: "ic:specific,isc:brown",
    };
    const typeMap: Record<string, string> = {
      photo: "itp:photo",
      clipart: "itp:clipart",
      lineart: "itp:lineart",
      gif: "itp:animated",
    };
    const layoutMap: Record<string, string> = {
      square: "iar:s",
      wide: "iar:w",
      tall: "iar:t",
    };
    const licenseMap: Record<string, string> = {
      "any-cc": "sur:fc",
      commercial: "sur:fmc",
      share: "sur:f",
    };

    if (imageFilters.size !== "any" && sizeMap[imageFilters.size]) {
      parts.push(sizeMap[imageFilters.size]);
    }
    if (imageFilters.color !== "any" && colorMap[imageFilters.color]) {
      parts.push(colorMap[imageFilters.color]);
    }
    if (imageFilters.type !== "any" && typeMap[imageFilters.type]) {
      parts.push(typeMap[imageFilters.type]);
    }
    if (imageFilters.layout !== "any" && layoutMap[imageFilters.layout]) {
      parts.push(layoutMap[imageFilters.layout]);
    }
    if (imageFilters.license !== "any" && licenseMap[imageFilters.license]) {
      parts.push(licenseMap[imageFilters.license]);
    }
  }

  return parts.length > 0 ? parts.join(",") : null;
}

export class GoogleImagesEngine implements SearchEngine {
  name = "Google Images";

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

    const tbs = buildGoogleImageTbs(timeFilter, context?.imageFilters);
    if (tbs) params.set("tbs", tbs);

    const ua = getRandomGsaAgent();
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(
      `https://www.google.com/search?${params.toString()}`,
      {
        headers: {
          "User-Agent": ua,
          Accept: "*/*",
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
          imageUrl: item.original_image?.url || "",
          imageWidth: item.original_image?.width,
          imageHeight: item.original_image?.height,
        });
      }
    }

    return results;
  }
}
