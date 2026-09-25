import { SettingsPageHeader } from "./page-header";

const t = window.scopedT("core");

export const AuthGate = ({ onSubmit }: { onSubmit: (event: Event) => void }): JSX.Element => (
  <>
    <SettingsPageHeader />
    <div class="settings-auth-gate">
      <div class="settings-auth-gate-inner">
        <span class="settings-auth-lock" aria-hidden="true">
          <i class="fa-solid fa-lock"></i>
        </span>
        <p class="settings-auth-desc">{t("settings-page.gate.desc")}</p>
        <form
          class="settings-auth-form"
          id="settings-auth-form"
          autocomplete="off"
          onSubmit={onSubmit}
        >
          <input
            class="settings-auth-input"
            type="password"
            id="settings-auth-input"
            placeholder={t("settings-page.gate.password-placeholder")}
            autocomplete="current-password"
            autofocus={true}
          />
          <button class="settings-auth-submit" type="submit">
            {t("settings-page.gate.unlock")}
          </button>
        </form>
        <p class="settings-auth-error" id="settings-auth-error"></p>
      </div>
    </div>
  </>
);
