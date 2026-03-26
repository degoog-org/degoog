import { state } from "../state";

export const proxyImageUrl = (url: string): string => {
  if (!url) return "";
  return `/api/proxy/image?url=${encodeURIComponent(url)}`;
};

export const faviconUrl = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    return proxyImageUrl(`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`);
  } catch {
    return "";
  }
};

export const buildSearchUrl = (
  query: string,
  engines: Record<string, boolean>,
  type: string,
  page: number,
): string => {
  const params = new URLSearchParams({ q: query });
  for (const [key, val] of Object.entries(engines)) {
    params.set(key, String(val));
  }
  if (type && type !== "all") {
    params.set("type", type);
  }
  if (page != null && page > 1) {
    params.set("page", String(page));
  }
  if (state.currentTimeFilter && state.currentTimeFilter !== "any") {
    params.set("time", state.currentTimeFilter);
  }
  if (state.currentTimeFilter === "custom") {
    if (state.customDateFrom) params.set("dateFrom", state.customDateFrom);
    if (state.customDateTo) params.set("dateTo", state.customDateTo);
  }
  if (state.currentLanguage) {
    params.set("lang", state.currentLanguage);
  }
  return `/api/search?${params.toString()}`;
};
