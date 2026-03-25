import {
  closeMediaLightbox,
  closeMediaPreview,
  endMediaLightboxDrag,
  isMediaLightboxOpen,
  navigateMediaPreview,
  openCurrentMediaLightbox,
  openRelatedMedia,
  runMediaAction,
  startMediaLightboxDrag,
  updateMediaLightboxDrag,
  zoomMediaLightbox,
} from "./media";

function _closeMenus(except?: HTMLElement | null): void {
  document.querySelectorAll<HTMLElement>(".media-action-menu-wrap").forEach((wrap) => {
    if (except && wrap === except) return;
    wrap.classList.remove("open");
  });
}

export function initMediaPreview(): void {
  document
    .getElementById("media-preview-close")
    ?.addEventListener("click", closeMediaPreview);
  document
    .getElementById("media-preview-prev")
    ?.addEventListener("click", () => navigateMediaPreview(-1));
  document
    .getElementById("media-preview-next")
    ?.addEventListener("click", () => navigateMediaPreview(1));
  document
    .getElementById("media-preview-img")
    ?.addEventListener("click", () => openCurrentMediaLightbox());

  document
    .getElementById("media-lightbox-close")
    ?.addEventListener("click", () => closeMediaLightbox());
  document
    .getElementById("media-lightbox-backdrop")
    ?.addEventListener("click", () => closeMediaLightbox());
  document
    .getElementById("media-lightbox-prev")
    ?.addEventListener("click", () => navigateMediaPreview(-1, { forceLightbox: true }));
  document
    .getElementById("media-lightbox-next")
    ?.addEventListener("click", () => navigateMediaPreview(1, { forceLightbox: true }));
  document
    .getElementById("media-lightbox-zoom-in")
    ?.addEventListener("click", () => zoomMediaLightbox(0.2));
  document
    .getElementById("media-lightbox-zoom-out")
    ?.addEventListener("click", () => zoomMediaLightbox(-0.2));

  const lightboxStage = document.getElementById("media-lightbox-stage");
  lightboxStage?.addEventListener("wheel", (event) => {
    if (!isMediaLightboxOpen()) return;
    event.preventDefault();
    zoomMediaLightbox(event.deltaY < 0 ? 0.15 : -0.15);
  });
  lightboxStage?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("#media-lightbox-img")) return;
    if (target.closest(".media-lightbox-zoom")) return;
    closeMediaLightbox();
  });
  lightboxStage?.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest("#media-lightbox-img")) return;
    startMediaLightboxDrag(event, lightboxStage as HTMLElement);
  });
  lightboxStage?.addEventListener("pointermove", updateMediaLightboxDrag);
  lightboxStage?.addEventListener("pointerup", () =>
    endMediaLightboxDrag(lightboxStage),
  );
  lightboxStage?.addEventListener("pointercancel", () =>
    endMediaLightboxDrag(lightboxStage),
  );
  lightboxStage?.addEventListener("lostpointercapture", () =>
    endMediaLightboxDrag(lightboxStage),
  );

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const related = target.closest<HTMLElement>(".media-related-card");
    if (related?.dataset.relatedIdx) {
      openRelatedMedia(parseInt(related.dataset.relatedIdx, 10));
      return;
    }

    const actionBtn = target.closest<HTMLElement>("[data-action]");
    if (actionBtn?.dataset.action) {
      event.preventDefault();
      void runMediaAction(actionBtn.dataset.action);
      _closeMenus();
      return;
    }

    const toggle = target.closest<HTMLElement>(".media-menu-toggle");
    if (toggle) {
      const wrap = toggle.closest<HTMLElement>(".media-action-menu-wrap");
      const opening = !(wrap?.classList.contains("open") ?? false);
      _closeMenus(opening ? wrap : null);
      wrap?.classList.toggle("open", opening);
      return;
    }

    if (!target.closest(".media-action-menu-wrap")) {
      _closeMenus();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (isMediaLightboxOpen()) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateMediaPreview(-1, { forceLightbox: true });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateMediaPreview(1, { forceLightbox: true });
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeMediaLightbox();
      }
      return;
    }

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
