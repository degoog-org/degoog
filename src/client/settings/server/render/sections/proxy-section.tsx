import { Button } from "../../../../../shared/ui/components/primitives/button";
import { FIELDSET, FIELDSET_INNER, TEXTAREA, WRAP } from "../classes";
import { SectionDesc } from "../section-desc";
import { ServerLabel } from "../server-label";
import { ServerSection } from "../server-section";
import { ServerToggle } from "../server-toggle";

const t = window.scopedT("core");

export const ProxySection = (): JSX.Element => (
  <ServerSection
    id="settings-section-proxy"
    heading="settings-page.server.proxy-heading"
    icon="fa-solid fa-network-wired"
    desc="settings-page.server.proxy-desc"
  >
    <fieldset class={FIELDSET}>
      <ServerToggle id="settings-proxy-enabled" label="settings-page.server.proxy-enable" aria="settings-page.server.proxy-enable-aria" />
      <div class={WRAP} id="settings-proxy-urls-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <ServerLabel htmlFor="settings-proxy-urls" k="settings-page.server.proxy-urls-label" />
          <textarea
            id="settings-proxy-urls"
            data-save-key="proxyUrls"
            class={TEXTAREA}
            rows={4}
            placeholder={"http://proxy1:8080\nhttp://user:pass@proxy2:8080\nsocks5://proxy3:1080"}
          ></textarea>
          <Button variant="secondary" class="proxy-test-btn" id="settings-proxy-test">
            {t("settings-page.server.proxy-test")}
          </Button>
          <div class="proxy-test-result" id="settings-proxy-test-result" hidden={true}></div>
        </fieldset>
        <fieldset class={FIELDSET_INNER}>
          <ServerLabel htmlFor="settings-proxy-cooldown-minutes" k="settings-page.server.proxy-cooldown-minutes-label" />
          <SectionDesc k="settings-page.server.proxy-cooldown-minutes-desc" />
          <input
            type="number"
            id="settings-proxy-cooldown-minutes"
            data-save-key="proxyCooldownMinutes"
            class="degoog-input"
            min={0}
            max={1440}
            placeholder="10"
          />
        </fieldset>
        <fieldset class={FIELDSET_INNER}>
          <ServerLabel htmlFor="settings-proxy-cooldown-triggers" k="settings-page.server.proxy-cooldown-triggers-label" />
          <SectionDesc k="settings-page.server.proxy-cooldown-triggers-desc" />
          <textarea
            id="settings-proxy-cooldown-triggers"
            data-save-key="proxyCooldownTriggers"
            class={TEXTAREA}
            rows={4}
            placeholder={"rate_limited\ncaptcha\nblocked\nconnect"}
          ></textarea>
        </fieldset>
        <fieldset class={FIELDSET_INNER}>
          <ServerLabel htmlFor="settings-proxy-host-groups" k="settings-page.server.proxy-host-groups-label" />
          <SectionDesc k="settings-page.server.proxy-host-groups-desc" />
          <textarea
            id="settings-proxy-host-groups"
            data-save-key="proxyHostGroups"
            class={TEXTAREA}
            rows={3}
            placeholder={"example.com example.co.uk"}
          ></textarea>
        </fieldset>
      </div>
      <ServerToggle id="settings-image-proxy-allow-local" label="settings-page.server.image-proxy-allow-local" aria="settings-page.server.image-proxy-allow-local-aria" />
      <div class={WRAP} id="settings-image-proxy-allow-list-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <ServerLabel htmlFor="settings-image-proxy-allow-list" k="settings-page.server.image-proxy-allow-list-label" />
          <SectionDesc k="settings-page.server.image-proxy-allow-list-desc" />
          <textarea
            id="settings-image-proxy-allow-list"
            data-save-key="imageProxyAllowList"
            class={TEXTAREA}
            rows={4}
            placeholder={"^192\\.168\\.\n^10\\.\njellyfin\\.lan"}
          ></textarea>
        </fieldset>
      </div>
      <ServerToggle id="settings-block-client-leaks" label="settings-page.server.block-client-leaks" aria="settings-page.server.block-client-leaks-aria" />
      <SectionDesc k="settings-page.server.block-client-leaks-desc" />
      <div class={WRAP}>
        <fieldset class={FIELDSET_INNER}>
          <ServerLabel htmlFor="settings-privacy-policy" k="settings-page.server.privacy-policy-label" />
          <SectionDesc k="settings-page.server.privacy-policy-desc" />
          <textarea
            id="settings-privacy-policy"
            data-save-key="privacyPolicy"
            class={TEXTAREA}
            rows={8}
            placeholder={t("settings-page.server.privacy-policy-placeholder")}
          ></textarea>
        </fieldset>
      </div>
    </fieldset>
  </ServerSection>
);
