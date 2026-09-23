import { raw } from "../../../shared/ui/tribute/rawdogit";

export const Lightbox = (): JSX.Element => (
  <div
    class="store-lightbox"
    id="store-lightbox"
    aria-hidden="true"
    role="dialog"
    aria-modal="true"
    aria-label="Screenshot gallery"
  >
    <div class="store-lightbox-backdrop"></div>
    <button class="store-lightbox-close" type="button" aria-label="Close">
      {raw("&times;")}
    </button>
    <button class="store-lightbox-prev" type="button" aria-label="Previous">
      {raw("&larr;")}
    </button>
    <div class="store-lightbox-img-wrap">
      <img class="store-lightbox-img" src="" alt="" />
    </div>
    <button class="store-lightbox-next" type="button" aria-label="Next">
      {raw("&rarr;")}
    </button>
    <div class="store-lightbox-counter"></div>
  </div>
);
