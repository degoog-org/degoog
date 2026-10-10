import type { EventHandler } from "../../../shared/ui/tribute/types";
import { LensIcon } from "../../../shared/ui/components/extra-icons/lens-icon";

interface SearchImagePickButtonProps {
  label: string;
  onClick: EventHandler;
}

export const SearchImagePickButton = ({
  label,
  onClick,
}: SearchImagePickButtonProps): JSX.Element => (
  <button
    type="button"
    class="degoog-icon-btn degoog-search-image-pick"
    title={label}
    aria-label={label}
    onClick={onClick}
  >
    <LensIcon />
  </button>
);
