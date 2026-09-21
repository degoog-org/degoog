export const escapeHtml = (value: string | null | undefined): string => {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u00a0/g, "&nbsp;");
};

export const escapeAttribute = (value: string | null | undefined): string =>
  escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
