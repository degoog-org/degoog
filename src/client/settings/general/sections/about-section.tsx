import pkg from "../../../../../package.json";
import { Button, buttonClass } from "../../../../shared/ui/components/primitives/button";
import { requestInstallPrompt } from "../../../utils/app/install-prompt";
import { restartWizard } from "../../../modules/wizard/wizard";
import { SettingRow } from "../../shared/rows/setting-row";
import { GeneralCard } from "../general-card";

const t = window.scopedT("core");

export const WIZARD_ROW_ID = "settings-wizard-row";

export const AboutSection = (): JSX.Element => (
  <GeneralCard icon="fa-solid fa-circle-info" headingKey="settings-page.about.heading">
    <SettingRow
      label={t("settings-page.update-check.version", { version: pkg.version })}
      desc={
        <>
          <b id="settings-update-check-newversionavailable" hidden={true}>
            {`${t("settings-page.update-check.new-desc")} `}
          </b>
          {`${t("settings-page.update-check.newest")} `}
          <b id="settings-update-check-newestversion">{t("settings-page.update-check.unknown")}</b>
          {`. ${t("settings-page.update-check.last-checked")} `}
          <b id="settings-update-check-lastchecked">{t("settings-page.update-check.never")}</b>
          {"."}
        </>
      }
    >
      <Button variant="secondary" id="settings-update-check-check">
        {t("settings-page.update-check.check-now-button")}
      </Button>
      <a
        class={buttonClass("secondary")}
        target="_blank"
        rel="noopener"
        href="https://github.com/degoog-org/degoog/releases/latest"
      >
        {t("settings-page.update-check.open-link-button")}
      </a>
    </SettingRow>
    <SettingRow label={t("settings-page.install.heading")} desc={t("settings-page.install.desc")}>
      <Button variant="secondary" id="settings-install-prompt" onClick={() => requestInstallPrompt()}>
        {t("settings-page.install.prompt-button")}
      </Button>
    </SettingRow>
    <SettingRow id={WIZARD_ROW_ID} label={t("settings-page.wizard.restart-heading")} desc={t("settings-page.wizard.restart-desc")}>
      <Button variant="secondary" id="settings-wizard-restart" onClick={() => restartWizard()}>
        {t("settings-page.wizard.restart-button")}
      </Button>
    </SettingRow>
  </GeneralCard>
);
