import { closeMediaPreview, navigateMediaPreview } from "./media";
import { initLightbox } from "./lightbox";
import { isEditableTarget } from "../../utils/keyboard-shortcuts";

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

    const typing = isEditableTarget(e.target);

    if (e.key === "ArrowLeft" && !typing) {
      e.preventDefault();
      navigateMediaPreview(-1);
    } else if (e.key === "ArrowRight" && !typing) {
      e.preventDefault();
      navigateMediaPreview(1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMediaPreview();
    }
  });
}
