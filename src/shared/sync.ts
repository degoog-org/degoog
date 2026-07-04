export const ENGINES_KEY = "engines";
export const THEME_KEY = "theme";
export const OPEN_IN_NEW_TAB_KEY = "open_in_new_tab";
export const DISPLAY_ENGINE_PERFORMANCE = "display_engine_performance";
export const DISPLAY_SEARCH_SUGGESTIONS = "display_search_suggestions";
export const POST_METHOD_ENABLED = "post_method_enabled";
export const INLINE_GIF_PLAYBACK = "inline_gif_playback";
export const STICKY_SIDEBAR = "sticky_sidebar";
export const CENTERED_MODE = "centered_mode";
export const TAB_ORDER_SAVED = "tab-order-saved";

export const GENERAL_SYNC_KEYS = [
  THEME_KEY,
  OPEN_IN_NEW_TAB_KEY,
  DISPLAY_ENGINE_PERFORMANCE,
  DISPLAY_SEARCH_SUGGESTIONS,
  POST_METHOD_ENABLED,
  INLINE_GIF_PLAYBACK,
  STICKY_SIDEBAR,
  CENTERED_MODE,
] as const;

export const ENGINE_SYNC_KEYS = [ENGINES_KEY] as const;

export const SYNC_KEYS = [...GENERAL_SYNC_KEYS, ...ENGINE_SYNC_KEYS] as const;

export type SyncKey = (typeof SYNC_KEYS)[number];

const THEME_VALUES = ["system", "light", "dark"] as const;

const isThemeValue = (v: unknown): boolean =>
  typeof v === "string" && (THEME_VALUES as readonly string[]).includes(v);

const isEngineRecord = (v: unknown): boolean =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((val) => typeof val === "boolean");

export const isValidSyncValue = (key: string, value: unknown): boolean => {
  if (key === THEME_KEY) return isThemeValue(value);
  if (key === ENGINES_KEY) return isEngineRecord(value);
  if ((GENERAL_SYNC_KEYS as readonly string[]).includes(key))
    return typeof value === "boolean";
  return false;
};
