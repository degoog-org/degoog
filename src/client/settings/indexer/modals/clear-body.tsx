import { tr } from "../i18n";

export const ClearBody = (): JSX.Element => (
  <>
    <p>{tr("clear-modal-desc")}</p>
    <input
      type="text"
      id="indexer-clear-confirm"
      class="store-search-input degoog-search-bar degoog-search-bar--square-advanced"
      autocomplete="off"
    />
  </>
);
