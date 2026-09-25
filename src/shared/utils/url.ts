const ALLOWED_URL_SCHEMES = new Set([
  "http",
  "https",
  "ftp",
  "magnet",
  "mailto",
  "tel",
]);

export const cleanHostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export const linkHref = (url: string | null | undefined): string => {
  if (!url) return "";
  const normalized = url.replace(/[\t\n\r]/g, "").replace(/^[\x00-\x20]+/, "");
  const scheme = normalized.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!scheme) return normalized;
  return ALLOWED_URL_SCHEMES.has(scheme[1].toLowerCase()) ? normalized : "";
};

export const faviconHostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};
