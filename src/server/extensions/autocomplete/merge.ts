import type { AutocompleteSuggestion, RichSuggestion } from "../../types";

export interface NormSuggestion {
  text: string;
  source: string;
  rich?: RichSuggestion;
}

export interface ProviderSuggestions {
  results: AutocompleteSuggestion[];
  name: string;
}

const MAX_TOTAL = 10;
const MAX_RICH = 2;

const _decodeCodePoint = (value: string, radix: 10 | 16): string | null => {
  const point = Number.parseInt(value, radix);
  if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) return null;
  return String.fromCodePoint(point);
};

const _decodeHtmlEntities = (value: string): string =>
  value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|amp|lt|gt|quot|apos|#39);/gi,
    (match, dec: string | undefined, hex: string | undefined) => {
      if (dec) return _decodeCodePoint(dec, 10) ?? match;
      if (hex) return _decodeCodePoint(hex, 16) ?? match;
      const named = match.toLowerCase();
      if (named === "&amp;") return "&";
      if (named === "&lt;") return "<";
      if (named === "&gt;") return ">";
      if (named === "&quot;") return '"';
      if (named === "&apos;" || named === "&#39;") return "'";
      return match;
    },
  );

const _normalizeText = (value: string): string => _decodeHtmlEntities(value);

const _normalizeRich = (rich: RichSuggestion): RichSuggestion => ({
  ...rich,
  description:
    typeof rich.description === "string"
      ? _normalizeText(rich.description)
      : rich.description,
  thumbnail:
    typeof rich.thumbnail === "string"
      ? _normalizeText(rich.thumbnail)
      : rich.thumbnail,
  type: typeof rich.type === "string" ? _normalizeText(rich.type) : rich.type,
});

export const mergeSuggestions = (
  providers: ProviderSuggestions[],
  query: string,
): NormSuggestion[] => {
  const lower = query.toLowerCase();

  const richItems = new Map<
    string,
    { text: string; sources: string[]; rich: RichSuggestion }
  >();
  const perProvider: NormSuggestion[][] = [];

  for (const { results, name } of providers) {
    const plain: NormSuggestion[] = [];
    for (const s of results) {
      const text = _normalizeText(typeof s === "string" ? s : s.text);
      const rich =
        typeof s === "object" && s.rich ? _normalizeRich(s.rich) : undefined;

      if (text.toLowerCase() === lower) continue;

      if (rich && (rich.description || rich.thumbnail)) {
        const key = text.toLowerCase();
        const existing = richItems.get(key);
        if (existing) {
          if (!existing.sources.includes(name)) existing.sources.push(name);
          if (!existing.rich.description && rich.description)
            existing.rich.description = rich.description;
          if (!existing.rich.thumbnail && rich.thumbnail)
            existing.rich.thumbnail = rich.thumbnail;
          if (!existing.rich.type && rich.type) existing.rich.type = rich.type;
        } else if (richItems.size < MAX_RICH) {
          richItems.set(key, { text, sources: [name], rich });
        }
      } else {
        plain.push({ text, source: name });
      }
    }
    perProvider.push(plain);
  }

  const seen = new Map<string, { text: string; sources: string[] }>();
  const maxLen = perProvider.reduce((m, p) => Math.max(m, p.length), 0);
  const plainCap = MAX_TOTAL - richItems.size;

  outer: for (let i = 0; i < maxLen; i++) {
    for (const providerResults of perProvider) {
      if (i >= providerResults.length) continue;
      const item = providerResults[i];
      const key = item.text.toLowerCase();
      if (richItems.has(key)) continue;
      const existing = seen.get(key);
      if (existing) {
        if (!existing.sources.includes(item.source))
          existing.sources.push(item.source);
      } else {
        if (seen.size >= plainCap) break outer;
        seen.set(key, { text: item.text, sources: [item.source] });
      }
    }
  }

  const richMerged: NormSuggestion[] = Array.from(richItems.values()).map(
    (entry) => ({
      text: entry.text,
      source: entry.sources.join(", "),
      rich: { ...entry.rich },
    }),
  );

  const plainMerged: NormSuggestion[] = Array.from(seen.values()).map(
    (entry) => ({
      text: entry.text,
      source: entry.sources.join(", "),
    }),
  );

  return [...richMerged, ...plainMerged];
};
