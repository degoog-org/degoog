import type { DailyLogo } from "../../../daily-logo";

export const DailyLogoMini = ({ logo, src }: { logo: DailyLogo; src: string }): JSX.Element => (
  <img class="daily-logo-mini" src={src} alt={logo.title} title={logo.title} />
);
