import { getBase } from "./base-url";

export interface SearchUiConfig {
  enabled: boolean;
  disabledTypes: string[];
  infiniteScroll: boolean;
}

const FALLBACK: SearchUiConfig = {
  enabled: false,
  disabledTypes: [],
  infiniteScroll: false,
};

let _config: SearchUiConfig | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("extensions-saved", () => {
    _config = null;
  });
}

export const fetchStreamingConfig = async (): Promise<SearchUiConfig> => {
  if (_config) return _config;
  try {
    const res = await fetch(`${getBase()}/api/settings/streaming`);
    if (res.ok) {
      const data = (await res.json()) as Partial<SearchUiConfig>;
      _config = {
        enabled: data.enabled ?? false,
        disabledTypes: data.disabledTypes ?? [],
        infiniteScroll: data.infiniteScroll ?? false,
      };
      return _config;
    }
  } catch (err) {
    console.debug("[streaming] config fetch failed", err);
  }
  return FALLBACK;
};

export const infiniteScrollOn = (): boolean => _config?.infiniteScroll ?? false;
