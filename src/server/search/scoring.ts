import type { ScoredResult, SearchResult } from "../../shared/search-types";
import {
  stripHtml,
  stripCssBlocks,
  snippetDate,
  isPublishDate,
} from "../utils/text";
import { cleanUrl, normalizeUrl, urlIsGif } from "./url-normalize";

const _readSnippet = (
  raw: string,
  given?: string,
): { text: string; publishedAt?: string } => {
  const text = stripCssBlocks(stripHtml(raw));
  if (given && isPublishDate(given)) return { text, publishedAt: given };
  const dated = snippetDate(text);
  return dated
    ? { text: dated.rest, publishedAt: dated.iso }
    : { text };
};

const _mergeIntoMap = (
  urlMap: Map<string, ScoredResult>,
  results: SearchResult[],
  multiplier = 1,
): void => {
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const normalized = normalizeUrl(r.url);
    const insecure = normalized.startsWith("http://");
    const positionScore = Math.max(10 - i, 1) * multiplier;

    if (urlMap.has(normalized)) {
      const existing = urlMap.get(normalized)!;
      existing.score += positionScore + 5;
      if (!existing.sources.includes(r.source)) {
        existing.sources.push(r.source);
      }
      const incoming = _readSnippet(r.snippet, r.publishedAt);
      if (incoming.text.length > existing.snippet.length) {
        existing.snippet = incoming.text;
      }
      if (!existing.publishedAt && incoming.publishedAt) {
        existing.publishedAt = incoming.publishedAt;
      }
      if (r.thumbnail && !existing.thumbnail) {
        existing.thumbnail = r.thumbnail;
      }
      if (
        r.imageUrl &&
        (!existing.imageUrl || (!existing.isGif && urlIsGif(r.imageUrl)))
      ) {
        existing.imageUrl = r.imageUrl;
        existing.isGif = urlIsGif(r.imageUrl);
      }
      if (insecure) existing.insecure = true;
    } else {
      const fresh = _readSnippet(r.snippet, r.publishedAt);
      urlMap.set(normalized, {
        ...r,
        title: stripCssBlocks(stripHtml(r.title)),
        snippet: fresh.text,
        publishedAt: fresh.publishedAt,
        url: cleanUrl(r.url),
        score: positionScore,
        sources: [r.source],
        insecure,
        isGif: urlIsGif(r.imageUrl),
      });
    }
  }
};

const _sortedFromMap = (urlMap: Map<string, ScoredResult>): ScoredResult[] => {
  const scored = Array.from(urlMap.values());
  scored.sort((a, b) => b.score - a.score);
  return scored;
};

export const scoreResults = (
  allResults: { results: SearchResult[]; multiplier?: number }[],
): ScoredResult[] => {
  const urlMap = new Map<string, ScoredResult>();
  for (const { results, multiplier } of allResults) {
    _mergeIntoMap(urlMap, results, multiplier ?? 1);
  }
  return _sortedFromMap(urlMap);
};

export const mergeNewResults = (
  existing: ScoredResult[],
  newResults: SearchResult[],
): ScoredResult[] => {
  const urlMap = new Map<string, ScoredResult>();
  for (const r of existing) {
    urlMap.set(normalizeUrl(r.url), { ...r, sources: [...r.sources] });
  }
  _mergeIntoMap(urlMap, newResults);
  return _sortedFromMap(urlMap);
};
