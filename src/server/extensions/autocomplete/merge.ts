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
      const text = typeof s === "string" ? s : s.text;
      const rich = typeof s === "object" ? s.rich : undefined;

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
