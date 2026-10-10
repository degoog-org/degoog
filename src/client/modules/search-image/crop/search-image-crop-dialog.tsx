import type { EventHandler } from "../../../../shared/ui/tribute/types";

export const CROP_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

export type CropHandle = (typeof CROP_HANDLES)[number];

interface SearchImageCropDialogProps {
  src: string;
  title: string;
  hint: string;
  boxLabel: string;
  resetLabel: string;
  cancelLabel: string;
  searchLabel: string;
  onReset: EventHandler;
  onCancel: EventHandler;
  onSearch: EventHandler;
}

export const SearchImageCropDialog = ({
  src,
  title,
  hint,
  boxLabel,
  resetLabel,
  cancelLabel,
  searchLabel,
  onReset,
  onCancel,
  onSearch,
}: SearchImageCropDialogProps): JSX.Element => (
  <dialog
    class="degoog-search-image-crop"
    aria-labelledby="degoog-search-image-crop-title"
    aria-describedby="degoog-search-image-crop-hint"
  >
    <div class="degoog-search-image-crop-panel">
      <div class="degoog-search-image-crop-head">
        <h2 id="degoog-search-image-crop-title" class="degoog-search-image-crop-title">
          {title}
        </h2>
        <p id="degoog-search-image-crop-hint" class="degoog-search-image-crop-hint">
          {hint}
        </p>
      </div>
      <div class="degoog-search-image-crop-frame">
        <div class="degoog-search-image-crop-stage">
          <img class="degoog-search-image-crop-img" src={src} alt="" draggable="false" />
          <div
            class="degoog-search-image-crop-box"
            tabindex="0"
            role="group"
            aria-label={boxLabel}
            autofocus
          >
            <span class="degoog-search-image-crop-grid"></span>
            {CROP_HANDLES.map((handle) => (
              <span
                class={`degoog-search-image-crop-handle degoog-search-image-crop-handle--${handle}`}
                data-handle={handle}
              ></span>
            ))}
            <span class="degoog-search-image-crop-size" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <div class="degoog-search-image-crop-actions">
        <button type="button" class="degoog-btn degoog-search-image-crop-reset" onClick={onReset}>
          <i class="fa-solid fa-rotate-left"></i>
          {resetLabel}
        </button>
        <button
          type="button"
          class="degoog-btn degoog-btn--secondary degoog-search-image-crop-cancel"
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          class="degoog-btn degoog-btn--primary degoog-search-image-crop-search"
          onClick={onSearch}
        >
          <i class="fa-solid fa-magnifying-glass"></i>
          {searchLabel}
        </button>
      </div>
    </div>
  </dialog>
);
