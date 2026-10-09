import {
  DISPLAY_ENGINE_PERFORMANCE,
  DISPLAY_SEARCH_SUGGESTIONS,
  INLINE_GIF_PLAYBACK,
  OPEN_IN_NEW_TAB_KEY,
  POST_METHOD_ENABLED,
  STICKY_SIDEBAR,
  CENTERED_MODE,
  HIDE_URL_PARAMS,
  SHOW_RESULT_DATES,
} from "../../constants";

export const INSTANCE_DEFAULT_VALUE = "";
export const FOLLOW_INSTANCE_ORIGIN = "follow-instance";
export const REGION_HOST_ID = "region-select-host";
export const REGION_SELECT_ID = "region-select";

export interface PrefCheck {
  id: string;
  labelKey: string;
  descKey?: string;
}

const KEY = "settings-page.search-options";

export const APPEARANCE_CHECKS: PrefCheck[] = [
  { id: "settings-centered-mode", labelKey: `${KEY}.centered-mode` },
  { id: "settings-sticky-sidebar", labelKey: `${KEY}.sticky-sidebar` },
];

export const RESULT_CHECKS: PrefCheck[] = [
  { id: "display-related-queries", labelKey: `${KEY}.related-queries` },
  { id: "display-engine-performance", labelKey: `${KEY}.engine-performance` },
  { id: "settings-show-result-dates", labelKey: `${KEY}.show-result-dates`, descKey: `${KEY}.show-result-dates-desc` },
  { id: "settings-inline-gif-playback", labelKey: `${KEY}.inline-gif-playback` },
  { id: "settings-hide-url-params", labelKey: `${KEY}.hide-url-params` },
];

export const SEARCHING_CHECKS: PrefCheck[] = [
  { id: "settings-open-new-tab", labelKey: `${KEY}.open-new-tab` },
  { id: "settings-post-method-enabled", labelKey: `${KEY}.post-method`, descKey: `${KEY}.post-method-desc` },
];

export const PREF_TOGGLES: {
  id: string;
  key: string;
  defaultVal?: boolean;
  invert?: boolean;
}[] = [
  { id: "settings-open-new-tab", key: OPEN_IN_NEW_TAB_KEY, defaultVal: false },
  { id: "display-engine-performance", key: DISPLAY_ENGINE_PERFORMANCE, defaultVal: true },
  { id: "display-related-queries", key: DISPLAY_SEARCH_SUGGESTIONS, defaultVal: true },
  { id: "settings-inline-gif-playback", key: INLINE_GIF_PLAYBACK, defaultVal: false, invert: true },
  { id: "settings-post-method-enabled", key: POST_METHOD_ENABLED, defaultVal: false },
  { id: "settings-sticky-sidebar", key: STICKY_SIDEBAR, defaultVal: false },
  { id: "settings-centered-mode", key: CENTERED_MODE, defaultVal: false },
  { id: "settings-hide-url-params", key: HIDE_URL_PARAMS, defaultVal: false },
  { id: "settings-show-result-dates", key: SHOW_RESULT_DATES, defaultVal: true },
];
