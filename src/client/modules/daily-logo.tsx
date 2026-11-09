import type { DailyLogo } from "../../shared/daily-logo";
import { DailyLogoBanner } from "../../shared/ui/components/logos/daily-logo-banner";
import { DailyLogoCredit } from "../../shared/ui/components/logos/daily-logo-credit";
import { DailyLogoMini } from "../../shared/ui/components/logos/daily-logo-mini";
import { append, clear, render } from "../../shared/ui/tribute/dom";
import { SHOW_LOGOS } from "../constants";
import { getBase } from "../utils/net/base-url";
import { idbGet } from "../utils/storage/db";

declare global {
  interface Window {
    __DEGOOG_LOGO__?: DailyLogo;
  }
}

const t = window.scopedT("core");

export const readDailyLogo = async (): Promise<DailyLogo | null> => {
  const logo = window.__DEGOOG_LOGO__;
  if (!logo) return null;
  return (await idbGet<boolean>(SHOW_LOGOS)) === false ? null : logo;
};

export function renderDailyLogo(logo: DailyLogo, onSearch: (query: string) => void): void {
  const src = `${getBase()}${logo.image}`;
  const home = document.getElementById("home-logo");
  if (home) {
    clear(home);
    render(
      <DailyLogoBanner logo={logo} src={src} action={`${getBase()}/search`} method="get" />,
      home,
    );
    home.querySelector(".daily-logo")?.addEventListener("submit", (e) => {
      e.preventDefault();
      onSearch(logo.query);
    });
  }
  const footer = document.getElementById("home-footer");
  if (footer) {
    append(
      <DailyLogoCredit authors={logo.authors} prefix={t("daily-logo.credit-prefix")} />,
      footer,
    );
  }
  const resultsLogo = document.querySelector(".results-logo");
  if (resultsLogo) {
    clear(resultsLogo);
    render(<DailyLogoMini logo={logo} src={src} />, resultsLogo);
  }
}
