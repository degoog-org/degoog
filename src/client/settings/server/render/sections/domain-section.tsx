import { FIELDSET, FIELDSET_INNER, LABEL, TEXTAREA, WRAP } from "../classes";
import { SectionDesc } from "../section-desc";
import { ServerLabel } from "../server-label";
import { ServerSection } from "../server-section";
import { ServerToggle } from "../server-toggle";

const t = window.scopedT("core");

export const DomainSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-domain-management"
    heading="settings-page.server.domain-management-heading"
    icon="fa-solid fa-globe"
    desc="settings-page.server.domain-management-desc"
  >
    <fieldset class={FIELDSET}>
      <ServerToggle id="settings-domain-block-enabled" label="settings-page.server.domain-block-enable" aria="settings-page.server.domain-block-enable-aria" />
      <SectionDesc k="settings-page.server.domain-block-desc" />
      <div class={WRAP} id="settings-domain-block-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <ServerLabel htmlFor="settings-domain-block-list" k="settings-page.server.domain-block-list-label" />
          <SectionDesc k="settings-page.server.domain-block-regex-help" />
          <textarea
            id="settings-domain-block-list"
            data-save-key="domainBlockList"
            class={TEXTAREA}
            rows={5}
            placeholder={"quora.com\ntiktok.com\n/.*\\.spam\\.net/"}
          ></textarea>
          <ServerToggle id="settings-domain-block-ui-enabled" label="settings-page.server.domain-block-ui-enable" />
          <SectionDesc k="settings-page.server.domain-block-ui-desc" />
        </fieldset>
      </div>

      <ServerToggle id="settings-domain-replace-enabled" label="settings-page.server.domain-replace-enable" aria="settings-page.server.domain-replace-enable-aria" />
      <SectionDesc k="settings-page.server.domain-replace-desc" />
      <div class={WRAP} id="settings-domain-replace-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <ServerLabel htmlFor="settings-domain-replace-list" k="settings-page.server.domain-replace-list-label" />
          <textarea
            id="settings-domain-replace-list"
            data-save-key="domainReplaceList"
            class={TEXTAREA}
            rows={5}
            placeholder={
              "reddit.com -> teddit.example.com\ntwitter.com -> nitter.example.com\nwikipedia.org -> https://wiki.example.com/viewer#wikipedia_en_all{{path}}"
            }
          ></textarea>
          <ServerToggle id="settings-domain-replace-ui-enabled" label="settings-page.server.domain-replace-ui-enable" />
          <SectionDesc k="settings-page.server.domain-replace-ui-desc" />
        </fieldset>
      </div>

      <ServerToggle id="settings-domain-score-enabled" label="settings-page.server.domain-score-enable" />
      <SectionDesc k="settings-page.server.domain-score-desc" />
      <div class={WRAP} id="settings-domain-score-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <span class={LABEL}>{t("settings-page.server.domain-score-list-label")}</span>
          <div id="settings-domain-score-rows" class="settings-score-rows"></div>
          <button type="button" id="settings-domain-score-add" class="settings-score-add">
            {t("settings-page.server.domain-score-add-row")}
          </button>
          <ServerToggle id="settings-domain-score-ui-enabled" label="settings-page.server.domain-score-ui-enable" />
          <SectionDesc k="settings-page.server.domain-score-ui-desc" />
        </fieldset>
      </div>
    </fieldset>
  </ServerSection>
);
