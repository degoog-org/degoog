import { FIELDSET } from "./classes";
import { SectionDesc } from "./section-desc";
import { ServerSection } from "./server-section";
import { ServerToggle } from "./server-toggle";

export const IndexerSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-indexer"
    heading="settings-page.server.indexer-heading"
    icon="fa-solid fa-database"
    desc="settings-page.server.indexer-desc"
  >
    <fieldset class={FIELDSET}>
      <ServerToggle
        id="settings-degoog-indexer-enabled"
        label="settings-page.server.indexer-enable"
        aria="settings-page.server.indexer-enable-aria"
      />
      <SectionDesc k="settings-page.server.indexer-enable-desc" />
    </fieldset>
  </ServerSection>
);
