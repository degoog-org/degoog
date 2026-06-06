export const SETTINGS_TOKEN_KEY = "degoog-settings-token";

export const getStoredToken = (): string | null =>
  sessionStorage.getItem(SETTINGS_TOKEN_KEY) || null;
