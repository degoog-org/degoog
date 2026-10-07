import type { EventHandler } from "../../../shared/ui/tribute/types";

interface SearchImageChipProps {
  src: string;
  cropLabel: string;
  removeLabel: string;
  onCrop: EventHandler;
  onRemove: EventHandler;
}

export const SearchImageChip = ({
  src,
  cropLabel,
  removeLabel,
  onCrop,
  onRemove,
}: SearchImageChipProps): JSX.Element => (
  <span class="degoog-search-image-chip">
    <button
      type="button"
      class="degoog-search-image-chip-crop"
      title={cropLabel}
      aria-label={cropLabel}
      onClick={onCrop}
    >
      <img class="degoog-search-image-chip-img" src={src} alt="" />
      <span class="degoog-search-image-chip-crop-icon">
        <i class="fa-solid fa-crop-simple"></i>
      </span>
    </button>
    <button
      type="button"
      class="degoog-search-image-chip-remove"
      title={removeLabel}
      aria-label={removeLabel}
      onClick={onRemove}
    >
      <i class="fa-solid fa-xmark"></i>
    </button>
  </span>
);
