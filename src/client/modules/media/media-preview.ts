import { closeMediaPreview, navigateMediaPreview } from "./media";
import { initLightbox } from "./lightbox";

export function initMediaPreview(): void {
  initLightbox();
  document.getElementById("media-preview-close")?.addEventListener("click", closeMediaPreview);
  document.getElementById("media-preview-prev")?.addEventListener("click", () => navigateMediaPreview(-1));
  document.getElementById("media-preview-next")?.addEventListener("click", () => navigateMediaPreview(1));

  document.addEventListener("keydown", (e) => {
    const panel = document.getElementById("media-preview-panel");
    if (!panel?.classList.contains("open")) return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigateMediaPreview(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      navigateMediaPreview(1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMediaPreview();
    }
  });
}
