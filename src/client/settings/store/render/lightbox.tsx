import { FaIcon } from "./fa-icon";
import { st } from "../format";
import type { StoreActions, StoreLightbox } from "../../../types/store-tab";

export const LIGHTBOX_CLOSE_CLASS = "store-lightbox-close";

export const Lightbox = ({
  lightbox,
  actions,
}: {
  lightbox: StoreLightbox | null;
  actions: StoreActions;
}): JSX.Element => {
  const n = lightbox?.urls.length ?? 0;
  const index = lightbox?.index ?? 0;
  const name = lightbox?.name ?? "";
  return (
    <div
      class={lightbox ? "store-lightbox store-lightbox--open" : "store-lightbox"}
      aria-hidden={lightbox ? "false" : "true"}
      role="dialog"
      aria-modal="true"
      aria-label={st("lightbox-aria")}
    >
      <div class="store-lightbox-backdrop" onClick={actions.closeLightbox}></div>
      <button
        class={LIGHTBOX_CLOSE_CLASS}
        type="button"
        aria-label={st("close-aria")}
        onClick={actions.closeLightbox}
      >
        {"×"}
      </button>
      <button
        class="store-lightbox-prev"
        type="button"
        aria-label={st("prev-aria")}
        hidden={n < 2}
        onClick={() => actions.stepLightbox(-1)}
      >
        <FaIcon name="fa-arrow-left" />
      </button>
      <div class="store-lightbox-img-wrap">
        <img
          class="store-lightbox-img"
          src={lightbox?.urls[index] ?? ""}
          alt={lightbox ? st("shot-alt", { name, n: String(index + 1) }) : ""}
        />
      </div>
      <button
        class="store-lightbox-next"
        type="button"
        aria-label={st("next-aria")}
        hidden={n < 2}
        onClick={() => actions.stepLightbox(1)}
      >
        <FaIcon name="fa-arrow-right" />
      </button>
      <div class="store-lightbox-counter">
        {n > 1 ? st("shot-counter", { name, n: String(index + 1), total: String(n) }) : name}
      </div>
    </div>
  );
};
