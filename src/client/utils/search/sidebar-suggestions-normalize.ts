export interface SidebarSuggestionItem {
  text?: unknown;
}

export function normalizeSidebarSuggestions(
  raw: unknown,
  query: string,
  limit = 8,
): string[] {
  if (!Array.isArray(raw)) return [];

  const queryKey = query.trim().toLowerCase();
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const item of raw) {
    const text =
      typeof item === "string"
        ? item
        : typeof item === "object" && item !== null
          ? String((item as SidebarSuggestionItem).text ?? "")
          : "";
    const term = text.trim();
    const key = term.toLowerCase();
    if (!term || key === queryKey || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length >= limit) break;
  }

  return terms;
}
