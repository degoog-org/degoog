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
import type { ToggleOpts } from "../../types/settings-section";

export const INSTANCE_DEFAULT_VALUE = "";

export const SEARCH_OPTION_TOGGLES: ToggleOpts[] = [
  {
    id: "settings-open-new-tab",
    labelKey: "settings-page.search-options.open-new-tab",
    ariaKey: "settings-page.search-options.open-new-tab-aria",
  },
  {
    id: "display-engine-performance",
    labelKey: "settings-page.search-options.engine-performance",
    ariaKey: "settings-page.search-options.engine-performance-aria",
  },
  {
    id: "display-related-queries",
    labelKey: "settings-page.search-options.related-queries",
    ariaKey: "settings-page.search-options.related-queries-aria",
  },
  {
    id: "settings-inline-gif-playback",
    labelKey: "settings-page.search-options.inline-gif-playback",
    ariaKey: "settings-page.search-options.inline-gif-playback-aria",
  },
  {
    id: "settings-post-method-enabled",
    labelKey: "settings-page.search-options.post-method",
    ariaKey: "settings-page.search-options.post-method-aria",
    titleKey: "settings-page.search-options.post-method-tooltip",
  },
  {
    id: "settings-sticky-sidebar",
    labelKey: "settings-page.search-options.sticky-sidebar",
    ariaKey: "settings-page.search-options.sticky-sidebar-aria",
  },
  {
    id: "settings-centered-mode",
    labelKey: "settings-page.search-options.centered-mode",
    ariaKey: "settings-page.search-options.centered-mode-aria",
  },
  {
    id: "settings-hide-url-params",
    labelKey: "settings-page.search-options.hide-url-params",
    ariaKey: "settings-page.search-options.hide-url-params-aria",
  },
  {
    id: "settings-show-result-dates",
    labelKey: "settings-page.search-options.show-result-dates",
    ariaKey: "settings-page.search-options.show-result-dates-aria",
    titleKey: "settings-page.search-options.show-result-dates-tooltip",
  },
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
