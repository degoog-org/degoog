const _baseUrl = (process.env.DEGOOG_BASE_URL ?? "").trim().replace(/\/+$/, "");

const _basePath = (() => {
  if (!_baseUrl) return "";
  if (!/^https?:\/\//i.test(_baseUrl)) return _baseUrl;
  try {
    const u = new URL(_baseUrl);
    const p = u.pathname.replace(/\/+$/, "");
    return p === "/" ? "" : p;
  } catch {
    return _baseUrl;
  }
})();

export const getBaseUrl = (): string => _baseUrl;
export const getBasePath = (): string => _basePath;
