import { FIELDSET_INNER } from "../classes";
import { SectionDesc } from "../section-desc";
import { ServerLabel } from "../server-label";
import { ServerSection } from "../server-section";

export const CustomCssSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-custom-css"
    heading="settings-page.server.custom-css-heading"
    icon="fa-solid fa-code"
  >
    <fieldset class={FIELDSET_INNER}>
      <SectionDesc k="settings-page.server.custom-css-desc" />
      <ServerLabel htmlFor="settings-custom-css" k="settings-page.server.custom-css-label" />
      <textarea
        id="settings-custom-css"
        data-save-key="customCss"
        class="settings-proxy-urls settings-custom-css degoog-input"
        rows={12}
        spellcheck="false"
        placeholder=".result-title { color: hotpink !important; }"
      ></textarea>
    </fieldset>
  </ServerSection>
);
