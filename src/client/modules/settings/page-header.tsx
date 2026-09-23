import { BackArrow } from "./back-arrow";

const t = window.scopedT("core");

export const SettingsPageHeader = (): JSX.Element => (
  <header class="settings-page-header">
    <a href="/" class="settings-page-back">
      <BackArrow />
      {t("settings-page.back")}
    </a>
    <h1 class="settings-page-title">{t("settings-page.page-title")}</h1>
  </header>
);
