import { state } from "../../state";
import { searchAuthHeaders } from "../request";
import { getBase } from "../base-url";
import { normalizeSidebarSuggestions } from "./sidebar-suggestions-normalize";

export { normalizeSidebarSuggestions } from "./sidebar-suggestions-normalize";

export async function fetchSidebarSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!state.displaySearchSuggestions || !query.trim() || query.trim().startsWith("!")) {
    return [];
  }

  try {
    const res = state.postMethodEnabled
      ? await fetch(`${getBase()}/api/suggest`, {
          method: "POST",
          body: JSON.stringify({ query }),
          headers: {
            "Content-Type": "application/json",
            ...searchAuthHeaders(),
          },
          signal,
        })
      : await fetch(`${getBase()}/api/suggest?q=${encodeURIComponent(query)}`, {
          headers: searchAuthHeaders(),
          signal,
        });

    if (!res.ok) return [];
    return normalizeSidebarSuggestions(await res.json(), query);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return [];
    console.debug("[sidebar-suggestions] suggest request failed", err);
    return [];
  }
}
