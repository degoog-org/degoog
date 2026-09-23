import { SettingsPageHeader } from "./page-header";

const t = window.scopedT("core");

export const AuthMisconfigured = (): JSX.Element => (
  <>
    <SettingsPageHeader />
    <div class="settings-auth-gate">
      <div class="settings-auth-gate-inner">
        <span class="settings-auth-lock settings-auth-lock--warn" aria-hidden="true">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </span>
        <p class="settings-auth-desc">{t("settings-page.gate.misconfigured")}</p>
      </div>
    </div>
  </>
);
