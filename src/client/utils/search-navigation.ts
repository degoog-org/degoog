import { state } from "../state";

/**
 * Navigate to a search page via href (full page load).
 * GET mode: query and params are encoded in the URL.
 * POST mode: query/type/page are stored in sessionStorage.
 * @param query The search query
 * @param type The search type (e.g. "web", "images", "videos")
 * @param page The page number (1-based)
 * @returns void
 */
export function navigateToSearch(
  query: string,
  type?: string,
  page?: number,
): void {
  if (state.postMethodEnabled) {
    sessionStorage.setItem("degoog-post-query", query);
    if (type && type !== "web") {
      sessionStorage.setItem("degoog-post-type", type);
    }
    if (page && page > 1) {
      sessionStorage.setItem("degoog-post-page", String(page));
    }
    window.location.href = "/search";
    return;
  }

  const params = new URLSearchParams({ q: query });
  if (type && type !== "web") params.set("type", type);
  if (page && page > 1) params.set("page", String(page));
  window.location.href = `/search?${params.toString()}`;
}
