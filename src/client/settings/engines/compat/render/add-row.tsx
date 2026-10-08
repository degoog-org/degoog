import { Button } from "../../../../../shared/ui/components/primitives/button";
import { copy } from "./copy";

export const CompatAddRow = ({ layer }: { layer: string }): JSX.Element => (
  <form class="store-add-repo-wrap" id="compat-add-form">
    <input
      type="text"
      class="store-search-input degoog-search-bar degoog-search-bar--square-advanced store-input-url"
      id="compat-add-input"
      placeholder={copy("compat-add-placeholder", layer)}
      aria-label={copy("compat-add", layer)}
      autocomplete="off"
    />
    <Button
      variant="primary"
      type="submit"
      id="compat-add-btn"
      aria-label={copy("compat-add", layer)}
      data-tooltip={copy("compat-add", layer)}
    >
      <i class="fa-solid fa-plus" aria-hidden="true"></i>
    </Button>
  </form>
);
