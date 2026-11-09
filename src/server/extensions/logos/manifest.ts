import type { DailyLogoAuthor } from "../../../shared/daily-logo";
import { logger } from "../../utils/logger";

export interface ManifestLogo {
  id: string;
  query: string;
  title: Record<string, string>;
  authors: DailyLogoAuthor[];
  image: string;
}

export interface ManifestDay {
  commit: string;
  logos: ManifestLogo[];
}

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const IMAGE_FILE_PATTERN = /^image\.(png|jpg|jpeg|webp|avif)$/;
const MAX_QUERY_LENGTH = 200;
const MAX_TITLE_LENGTH = 120;
const MAX_NAME_LENGTH = 80;
const MAX_AUTHORS = 10;

const _isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const _text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() && value.length <= max
    ? value.trim()
    : null;

const _httpsUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const _parseTitle = (raw: unknown): Record<string, string> | null => {
  if (!_isRecord(raw)) return null;
  const title: Record<string, string> = {};
  for (const [locale, text] of Object.entries(raw)) {
    const value = _text(text, MAX_TITLE_LENGTH);
    if (LOCALE_PATTERN.test(locale) && value) title[locale] = value;
  }
  return title["en-US"] ? title : null;
};

const _parseAuthors = (raw: unknown): DailyLogoAuthor[] => {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_AUTHORS).flatMap((author): DailyLogoAuthor[] => {
    if (!_isRecord(author)) return [];
    const name = _text(author.name, MAX_NAME_LENGTH);
    if (!name) return [];
    const url = _httpsUrl(author.url);
    return [url ? { name, url } : { name }];
  });
};

const _parseLogo = (raw: unknown, date: string): ManifestLogo | null => {
  if (!_isRecord(raw)) return null;
  const id = typeof raw.id === "string" && SLUG_PATTERN.test(raw.id) ? raw.id : null;
  const query = _text(raw.query, MAX_QUERY_LENGTH);
  const title = _parseTitle(raw.title);
  const authors = _parseAuthors(raw.authors);
  if (!id || !query || !title || !authors.length) return null;
  const file = typeof raw.image === "string" ? raw.image.split("/").pop() ?? "" : "";
  const image = `logos/${date}/${id}/${file}`;
  if (!IMAGE_FILE_PATTERN.test(file) || raw.image !== image) return null;
  return { id, query, title, authors, image };
};

export const parseManifestDay = (raw: unknown, date: string): ManifestDay | null => {
  if (!_isRecord(raw) || !_isRecord(raw.logos)) return null;
  if (typeof raw.commit !== "string" || !COMMIT_PATTERN.test(raw.commit)) return null;
  const entries = raw.logos[date];
  if (!Array.isArray(entries)) return { commit: raw.commit, logos: [] };
  const logos = entries.flatMap((entry): ManifestLogo[] => {
    const logo = _parseLogo(entry, date);
    if (!logo) logger.warn("logos", `skipping an invalid logo listed for ${date}`);
    return logo ? [logo] : [];
  });
  return { commit: raw.commit, logos };
};
