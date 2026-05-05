export const authHeaders = (getToken: () => string | null): Record<string, string> => {
  const token = getToken();
  return token ? { "x-settings-token": token } : {};
};

export const jsonHeaders = (getToken: () => string | null): Record<string, string> => {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) base["x-settings-token"] = token;
  return base;
};

const _w = window as Window & {
  __DEGOOG_SEARCH_AUTH__?: { n: string; s: string };
};

export const getSearchAuth = (): { n: string; s: string } | null =>
  _w.__DEGOOG_SEARCH_AUTH__ ?? null;

export const searchAuthHeaders = (): Record<string, string> => {
  const auth = getSearchAuth();
  if (!auth) return {};
  return { "x-search-nonce": auth.n, "x-search-sig": auth.s };
};

export const appendSearchAuthParams = (url: string): string => {
  const auth = getSearchAuth();
  if (!auth) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}searchNonce=${encodeURIComponent(auth.n)}&searchSig=${encodeURIComponent(auth.s)}`;
};
