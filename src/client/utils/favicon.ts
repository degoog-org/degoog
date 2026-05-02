export const faviconCandidates = (hostname: string): string[] => {
  if (!hostname) return [];
  return [`/api/proxy/favicon?domain=${encodeURIComponent(hostname)}`];
};

const _faviconLetter = (hostname: string): string =>
  (hostname.replace(/^www\./, "")[0] ?? "?").toUpperCase();

const _replaceWithLetterFallback = (img: HTMLImageElement): void => {
  const hostname = img.dataset.faviconHost ?? "";
  const span = document.createElement("span");
  span.className = `${img.className} result-favicon-fallback`.trim();
  span.setAttribute("aria-hidden", "true");
  span.textContent = _faviconLetter(hostname);
  img.replaceWith(span);
};

export const attachFaviconFallback = (img: HTMLImageElement): void => {
  const hostname = img.dataset.faviconHost ?? "";
  const candidates = faviconCandidates(hostname);
  let index = 0;
  if (candidates[0] && img.src !== candidates[0]) {
    img.src = candidates[0];
  }
  img.onerror = () => {
    index += 1;
    if (index < candidates.length) {
      img.src = candidates[index];
      return;
    }
    img.onerror = null;
    _replaceWithLetterFallback(img);
  };
};
