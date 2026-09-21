import { FIELDSET, FIELDSET_INNER, WRAP } from "./classes";
import { SectionDesc } from "./section-desc";
import { ServerSection } from "./server-section";
import { ServerToggle } from "./server-toggle";

export const NojsSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-nojs"
    heading="settings-page.server.nojs-heading"
    icon="fa-solid fa-file-code"
    badge="settings-page.extensions.compat-experimental"
    desc="settings-page.server.nojs-desc"
  >
    <fieldset class={FIELDSET}>
      <ServerToggle id="settings-nojs-enabled" label="settings-page.server.nojs-enable" aria="settings-page.server.nojs-enable-aria" />
      <div class={WRAP} id="settings-nojs-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <ServerToggle id="settings-nojs-css-check" label="settings-page.server.nojs-css-check-enable" />
          <SectionDesc k="settings-page.server.nojs-css-check-desc" />
        </fieldset>
      </div>
    </fieldset>
  </ServerSection>
);
