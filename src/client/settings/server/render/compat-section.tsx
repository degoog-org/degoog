import { FIELDSET } from "./classes";
import { SectionDesc } from "./section-desc";
import { ServerSection } from "./server-section";
import { ServerToggle } from "./server-toggle";

export const CompatSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-searx"
    heading="settings-page.server.compat-heading"
    icon="fa-solid fa-flask"
    desc="settings-page.server.compat-desc"
  >
    <fieldset class={FIELDSET}>
      <ServerToggle id="settings-searx-compat-enabled" label="settings-page.server.searx-enable" aria="settings-page.server.searx-enable-aria" />
      <SectionDesc k="settings-page.server.searx-enable-desc" />
      <ServerToggle id="settings-searx-api-enabled" label="settings-page.server.searx-api-enable" aria="settings-page.server.searx-api-enable-aria" />
      <SectionDesc k="settings-page.server.searx-api-enable-desc" />
      <ServerToggle id="settings-fourget-compat-enabled" label="settings-page.server.4get-enable" aria="settings-page.server.4get-enable-aria" />
      <SectionDesc k="settings-page.server.4get-enable-desc" />
    </fieldset>
  </ServerSection>
);
