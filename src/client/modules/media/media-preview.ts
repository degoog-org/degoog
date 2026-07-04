import { closeMediaPreview, navigateMediaPreview } from "./media";
import { initLightbox } from "./lightbox";

export function initMediaPreview(): void {
  initLightbox();

  document.getElementById("media-preview-panel")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("#media-preview-close")) closeMediaPreview();
    else if (target.closest("#media-preview-prev")) navigateMediaPreview(-1);
    else if (target.closest("#media-preview-next")) navigateMediaPreview(1);
  });

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
