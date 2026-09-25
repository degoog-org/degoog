import { clear } from "../../../shared/ui/tribute/dom";
import type { ScoredResult } from "../../../shared/search-types";
import { cleanHostname, faviconHostname } from "../../../shared/utils/url";
import { attachFaviconFallback } from "../../utils/dom/favicon";

export const setPreviewSource = (item: ScoredResult): void => {
  const domain = document.getElementById("media-preview-domain");
  if (domain) domain.textContent = cleanHostname(item.url);

  const favWrap = document.getElementById("media-preview-favicon-wrap");
  if (!favWrap) return;

  const favicon = document.createElement("img");
  favicon.className = "media-preview-favicon";
  favicon.alt = "";
  favicon.dataset.faviconHost = faviconHostname(item.url);
  clear(favWrap);
  favWrap.appendChild(favicon);
  attachFaviconFallback(favicon);
};
