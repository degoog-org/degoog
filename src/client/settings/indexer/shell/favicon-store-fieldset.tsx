import { IndexerNumberField } from "./indexer-number-field";

const FAVICON_STORE_MAX_AGE_MIN = 1;
const FAVICON_STORE_MAX_AGE_MAX = 3650;

export const FaviconStoreFieldset = (): JSX.Element => (
  <fieldset class="settings-fieldset degoog-indexer-stats">
    <IndexerNumberField
      name="favicon-store-max-age-days"
      min={FAVICON_STORE_MAX_AGE_MIN}
      max={FAVICON_STORE_MAX_AGE_MAX}
    />
  </fieldset>
);
