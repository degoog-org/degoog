import { FIELDSET, FIELDSET_INNER, LABEL } from "../classes";
import { SectionDesc } from "../section-desc";
import { ServerLabel } from "../server-label";
import { ServerSection } from "../server-section";
import { ServerToggle } from "../server-toggle";

const t = window.scopedT("core");

export const HoneypotSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-honeypot"
    heading="settings-page.server.honeypot-heading"
    icon="fa-solid fa-spider"
    desc="settings-page.server.honeypot-desc"
  >
    <fieldset class={FIELDSET}>
      <ServerToggle id="settings-honeypot-enabled" label="settings-page.server.honeypot-enable" aria="settings-page.server.honeypot-enable-aria" />
      <ServerToggle id="settings-honeypot-css-check" label="settings-page.server.honeypot-css-check-enable" aria="settings-page.server.honeypot-css-check-aria" checked={true} />
      <fieldset class={FIELDSET_INNER}>
        <ServerLabel htmlFor="settings-honeypot-ban-duration" k="settings-page.server.honeypot-ban-duration-label" />
        <SectionDesc k="settings-page.server.honeypot-ban-duration-desc" />
        <input type="text" id="settings-honeypot-ban-duration" data-save-key="honeypotBanDuration" class="degoog-input" min={0} placeholder="72" />
      </fieldset>
      <fieldset class={FIELDSET_INNER}>
        <label class={LABEL}>{t("settings-page.server.honeypot-blocklist-label")}</label>
        <SectionDesc k="settings-page.server.honeypot-blocklist-desc" />
        <div class="settings-honeypot-ban-row">
          <input type="text" id="settings-honeypot-ban-ip" class="degoog-input" placeholder="192.168.1.100" spellcheck="false" />
          <button type="button" id="settings-honeypot-ban-add" class="degoog-btn degoog-btn--primary degoog-btn--sm">
            {t("settings-page.server.honeypot-ban-add")}
          </button>
        </div>
        <div id="settings-honeypot-blocklist-rows"></div>
      </fieldset>
    </fieldset>
  </ServerSection>
);
