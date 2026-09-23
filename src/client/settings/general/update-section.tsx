import pkg from "../../../../package.json";
import { Button, buttonClass } from "../../../shared/ui/components/primitives/button";
import { SettingsSection } from "../shared/settings-section";

const t = window.scopedT("core");

export const UpdateSection = (): JSX.Element => (
  <SettingsSection
    icon="fa-solid fa-bell"
    headingKey="settings-page.update-check.heading"
    noFieldset={true}
  >
    <p id="settings-update-check-newversionavailable" style="display: none">
      <b>{t("settings-page.update-check.new-desc")}</b>
    </p>
    <p class="settings-desc">
      <b>{pkg.version}</b>
      {t("settings-page.update-check.desc")}
      <b id="settings-update-check-newestversion">Unknown</b>
    </p>
    <p class="settings-desc">
      {`${t("settings-page.update-check.last-checked")}:`}
      <b id="settings-update-check-lastchecked">Never</b>
    </p>
    <Button variant="secondary" id="settings-update-check-check">
      {t("settings-page.update-check.check-now-button")}
    </Button>
    <a
      class={buttonClass("secondary")}
      type="button"
      target="_blank"
      href="https://github.com/degoog-org/degoog/releases/latest"
    >
      {t("settings-page.update-check.open-link-button")}
    </a>
  </SettingsSection>
);
