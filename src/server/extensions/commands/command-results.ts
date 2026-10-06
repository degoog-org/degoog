import type { ScoredResult } from "../../../shared/search-types";
import { isOwnFaviconUrl, signResultThumbnails } from "../../utils/net/proxy-sign";

const MAX_RESULTS = 500;
const MAX_TEXT = 2000;
const URL_RE = /^https?:\/\//i;

const _text = (value: unknown, max = MAX_TEXT): string =>
  typeof value === "string" ? value.slice(0, max) : "";

export const normalizeCommandResults = (
  raw: unknown,
  fallbackSource: string,
): ScoredResult[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const media = (value: unknown): string | undefined => {
    const url = _text(value);
    return URL_RE.test(url) ? url : undefined;
  };
  const items = raw.slice(0, MAX_RESULTS).filter(
    (r): r is Record<string, unknown> =>
      !!r && typeof r === "object" && URL_RE.test(_text(r.url)) && !!_text(r.title),
  );
  const signed = signResultThumbnails(
    items.map((r, i) => {
      const source = _text(r.source, 120) || fallbackSource;
      const thumbnail = media(r.thumbnail);
      const imageUrl = media(r.imageUrl);
      return {
        title: _text(r.title, 500),
        url: _text(r.url),
        snippet: _text(r.snippet),
        source,
        sources: [source],
        score: items.length - i,
        ...(thumbnail ? { thumbnail } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(typeof r.isGif === "boolean" ? { isGif: r.isGif } : {}),
        ...(_text(r.duration, 32) ? { duration: _text(r.duration, 32) } : {}),
        ...(_text(r.publishedAt, 64) ? { publishedAt: _text(r.publishedAt, 64) } : {}),
      };
    }),
  );
  return signed.map((result, i) => {
    const favicon = _text(items[i].favicon);
    return favicon && isOwnFaviconUrl(favicon) ? { ...result, favicon } : result;
  });
};
