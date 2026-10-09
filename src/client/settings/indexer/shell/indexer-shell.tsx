import { ServerSection } from "../../server/render/server-section";
import { FiltersFieldset } from "./filters-fieldset";
import { StatsBlock } from "./stats-block";
import { StorageFieldset } from "./storage-fieldset";
import { FaviconStoreFieldset } from "./favicon-store-fieldset";
import { tr } from "../i18n";

const KEY = "settings-page.indexer";

export const IndexerShell = (): JSX.Element => (
  <>
    <ServerSection
      id="indexer-tab-section"
      heading={`${KEY}.heading`}
      icon="fa-solid fa-database"
      desc={`${KEY}.desc`}
      collapsible={false}
    >
      <p
        id="indexer-disabled-note"
        class="settings-desc degoog-indexer-disabled-note"
        hidden={true}
      >
        {tr("disabled")}
      </p>
    </ServerSection>
    <ServerSection
      id="indexer-stats-wrap"
      heading={`${KEY}.stats-heading`}
      icon="fa-solid fa-chart-simple"
      open={true}
      hidden={true}
    >
      <StatsBlock />
    </ServerSection>
    <ServerSection
      id="indexer-filters-wrap"
      heading={`${KEY}.filters-heading`}
      icon="fa-solid fa-filter"
      hidden={true}
    >
      <FiltersFieldset />
    </ServerSection>
    <ServerSection
      id="indexer-storage-wrap"
      heading={`${KEY}.storage-heading`}
      icon="fa-solid fa-hard-drive"
      hidden={true}
    >
      <StorageFieldset />
    </ServerSection>
    <ServerSection
      id="indexer-favicon-store-wrap"
      heading={`${KEY}.favicon-store-heading`}
      icon="fa-solid fa-icons"
      desc={`${KEY}.favicon-store-desc`}
      hidden={true}
    >
      <FaviconStoreFieldset />
    </ServerSection>
  </>
);
