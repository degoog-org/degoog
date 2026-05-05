export const stripHtml = (text: string): string =>
  text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const _DATE_PREFIX =
  /^(?:\d{1,2}\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago/i;

export const stripSnippetPrefix = (text: string): string => {
  const stripped = text.replace(
    new RegExp(`^(?:${_DATE_PREFIX.source})\\s*[-–—·]\\s*`, "i"),
    "",
  );
  return stripped || text;
};

export const looksLikeProse = (text: string): boolean => {
  if (/\{[^}]{0,500}\}/.test(text)) return false;
  const specialChars = (text.match(/[^a-zA-Z0-9\s.,!?'"()\-–—]/g) ?? []).length;
  const words = text.split(/\s+/).filter(Boolean);
  return specialChars / text.length < 0.10 && words.length >= 8;
};
