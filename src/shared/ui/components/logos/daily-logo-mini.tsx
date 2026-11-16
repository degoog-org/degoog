import type { DailyLogo } from "../../../daily-logo";

export interface DailyLogoMiniProps {
  logo: DailyLogo;
}

export const DailyLogoMini = ({ logo }: DailyLogoMiniProps): JSX.Element => (
  <img class="daily-logo-mini" src={logo.src} alt={logo.title} title={logo.title} />
);
