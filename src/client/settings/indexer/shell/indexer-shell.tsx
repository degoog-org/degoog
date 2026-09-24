import { Desc } from "../../../../shared/ui/components/forms/desc";
import { Icon } from "../../../../shared/ui/components/primitives/icon";
import { FiltersFieldset } from "./filters-fieldset";
import { StatsBlock } from "./stats-block";
import { StorageFieldset } from "./storage-fieldset";
import { tr } from "../i18n";

export const IndexerShell = (): JSX.Element => (
  <section
    class="settings-section ext-card degoog-panel degoog-panel--ext-card"
    id="indexer-tab-section"
  >
    <div class="setting-section-heading-wrapper">
      <h2 class="settings-section-heading">{tr("heading")}</h2>
      <div class="floating-section-icon">
        <Icon name="fa-solid fa-database" />
      </div>
    </div>
    <Desc text={tr("desc")} />

    <p
      id="indexer-disabled-note"
      class="settings-desc degoog-indexer-disabled-note"
      hidden={true}
    >
      {tr("disabled")}
    </p>

    <fieldset class="settings-fieldset">
      <FiltersFieldset />
      <StorageFieldset />
      <StatsBlock />
    </fieldset>
  </section>
);
