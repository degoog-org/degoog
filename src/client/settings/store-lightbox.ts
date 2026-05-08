import { getBase } from "../utils/base-url";

export const screenshotUrl = (
  repoSlug: string,
  type: string,
  itemSlug: string,
  filename: string,
  token: string | null,
): string => {
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${getBase()}/api/store/screenshots/${encodeURIComponent(repoSlug)}/${encodeURIComponent(type)}/${encodeURIComponent(itemSlug)}/${encodeURIComponent(filename)}${q}`;
};

export const buildScreenshotUrls = (
  wrap: HTMLElement,
  getToken: () => string | null,
): string[] => {
  const rawFiles = wrap.dataset.screenshotFiles;
  if (rawFiles && rawFiles.trim()) {
    const files = rawFiles
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    if (files.length > 0) {
      const repoSlug = wrap.dataset.repoSlug ?? "";
      const type = wrap.dataset.itemType ?? "";
      const itemSlug = wrap.dataset.itemSlug ?? "";
      const token = getToken();
      return files.map((f) =>
        screenshotUrl(repoSlug, type, itemSlug, f, token),
      );
    }
  }
  if (wrap.dataset.firstScreenshotUrl) {
    return [wrap.dataset.firstScreenshotUrl];
  }
  return [];
};

export function initLightbox(
  container: HTMLElement,
  getToken: () => string | null,
): void {
  let lightboxUrls: string[] = [];
  let lightboxIndex = 0;

  const lb = container.querySelector<HTMLElement>("#store-lightbox");
  if (!lb) return;

  const img = lb.querySelector<HTMLImageElement>(".store-lightbox-img");
  const counter = lb.querySelector<HTMLElement>(".store-lightbox-counter");
  const prevBtn = lb.querySelector<HTMLButtonElement>(".store-lightbox-prev");
  const nextBtn = lb.querySelector<HTMLButtonElement>(".store-lightbox-next");

  function showSlide(): void {
    if (img) img.src = lightboxUrls[lightboxIndex] || "";
    if (counter)
      counter.textContent =
        lightboxUrls.length > 1
          ? `${lightboxIndex + 1} / ${lightboxUrls.length}`
          : "";
    if (prevBtn)
      prevBtn.style.visibility = lightboxUrls.length > 1 ? "visible" : "hidden";
    if (nextBtn)
      nextBtn.style.visibility = lightboxUrls.length > 1 ? "visible" : "hidden";
  }

  function closeLightbox(): void {
    lb?.classList.remove("store-lightbox--open");
    lb?.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") {
      lightboxIndex =
        (lightboxIndex - 1 + lightboxUrls.length) % lightboxUrls.length;
      showSlide();
    }
    if (e.key === "ArrowRight") {
      lightboxIndex = (lightboxIndex + 1) % lightboxUrls.length;
      showSlide();
    }
  }

  function openLightbox(wrap: HTMLElement): void {
    const urls = buildScreenshotUrls(wrap, getToken);
    if (!urls.length) return;
    lightboxUrls = urls;
    lightboxIndex = 0;
    lb?.classList.add("store-lightbox--open");
    lb?.setAttribute("aria-hidden", "false");
    showSlide();
    document.addEventListener("keydown", onKey);
    lb?.querySelector(".store-lightbox-close")?.addEventListener(
      "click",
      closeLightbox,
      {
        once: true,
      },
    );
    lb?.querySelector(".store-lightbox-backdrop")?.addEventListener(
      "click",
      closeLightbox,
      {
        once: true,
      },
    );
    prevBtn?.addEventListener("click", () => {
      lightboxIndex =
        (lightboxIndex - 1 + lightboxUrls.length) % lightboxUrls.length;
      showSlide();
    });
    nextBtn?.addEventListener("click", () => {
      lightboxIndex = (lightboxIndex + 1) % lightboxUrls.length;
      showSlide();
    });
  }

  const grid = container.querySelector<HTMLElement>(".store-catalog-grid");
  grid?.addEventListener("click", (e) => {
    const wrap = (e.target as HTMLElement).closest<HTMLElement>(
      ".store-card-thumb-wrap",
    );
    if (
      wrap &&
      (wrap.dataset.screenshotFiles || wrap.dataset.firstScreenshotUrl)
    ) {
      e.preventDefault();
      e.stopPropagation();
      openLightbox(wrap);
    }
  });

  grid?.addEventListener("keydown", (e) => {
    const wrap = (e.target as HTMLElement).closest<HTMLElement>(
      ".store-card-thumb-wrap",
    );
    if (
      wrap &&
      (wrap.dataset.screenshotFiles || wrap.dataset.firstScreenshotUrl) &&
      (e.key === "Enter" || e.key === " ")
    ) {
      e.preventDefault();
      openLightbox(wrap);
    }
  });
}
