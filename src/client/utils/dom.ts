export const cleanUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname;
  } catch {
    return url;
  }
};

export const cleanHostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export const escapeHtml = (str: string | null | undefined): string => {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
};

export const escapeAttribute = (str: string | null | undefined): string =>
  escapeHtml(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const ALLOWED_URL_SCHEMES = new Set([
  "http",
  "https",
  "ftp",
  "magnet",
  "mailto",
  "tel",
]);

export const linkHref = (url: string | null | undefined): string => {
  if (!url) return "";
  const normalized = url.replace(/[\t\n\r]/g, "").replace(/^[\x00-\x20]+/, "");
  const scheme = normalized.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!scheme) return normalized;
  return ALLOWED_URL_SCHEMES.has(scheme[1].toLowerCase()) ? normalized : "";
};

type SchemaField = { key: string; required?: boolean };

const _hasValue = (v: string | string[] | undefined): boolean => {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  return Array.isArray(v) && v.length > 0;
};

export const getConfigStatus = (ext: {
  configurable: boolean;
  settingsSchema: SchemaField[];
  settings: Record<string, string | string[]>;
}): "configured" | "needs-config" | null => {
  if (!ext.configurable || ext.settingsSchema.length === 0) return null;
  const missingRequired = ext.settingsSchema.some(
    (f) => f.required === true && !_hasValue(ext.settings[f.key]),
  );
  return missingRequired ? "needs-config" : "configured";
};

export const getInputElement = (id: string) => {
  return document.getElementById(id) as HTMLInputElement | null;
};
