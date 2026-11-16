import { getBase } from "../../net/base-url";
import { onWindowEvent } from "../../dom/window-event";

const PANELS_MAX_WAIT_DEFAULT_MS = 4000;

export interface SearchUiConfig {
  enabled: boolean;
  disabledTypes: string[];
  infiniteScroll: boolean;
  panelsMaxWaitMs: number;
}

const FALLBACK: SearchUiConfig = {
  enabled: false,
  disabledTypes: [],
  infiniteScroll: false,
  panelsMaxWaitMs: PANELS_MAX_WAIT_DEFAULT_MS,
};

let _config: SearchUiConfig | null = null;

onWindowEvent("extensions-saved", () => {
  _config = null;
});

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
        panelsMaxWaitMs: data.panelsMaxWaitMs ?? PANELS_MAX_WAIT_DEFAULT_MS,
      };
      return _config;
    }
  } catch (err) {
    console.debug("[streaming] config fetch failed", err);
  }
  return FALLBACK;
};

export const infiniteScrollOn = (): boolean => _config?.infiniteScroll ?? false;

export const panelsMaxWaitMs = (): number =>
  _config?.panelsMaxWaitMs ?? PANELS_MAX_WAIT_DEFAULT_MS;
