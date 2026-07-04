import { renderTemplate } from "../../utils/template";

const PAGE_SLOTS: [string, string][] = [
  ["degoog-home-header", "header"],
  ["degoog-home-logo", "home-logo"],
  ["degoog-home-search", "home-search"],
  ["degoog-home-footer", "home-footer"],
  ["degoog-search-header", "results-header"],
  ["degoog-search-tabs", "results-tabs"],
  ["degoog-search-lightbox", "img-lightbox"],
];

export function renderPageTemplates(): void {
  for (const [templateId, containerId] of PAGE_SLOTS) {
    const container = document.getElementById(containerId);
    if (!container) continue;
    const html = renderTemplate(templateId, {});
    if (html !== null) container.innerHTML = html;
  }

  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  if (searchInput && !new URLSearchParams(window.location.search).has("q")) {
    searchInput.focus();
  }
}
