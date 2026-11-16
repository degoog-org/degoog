import type { DailyLogo } from "../../../daily-logo";

export interface DailyLogoBannerProps {
  logo: DailyLogo;
  action: string;
  method: string;
}

export const DailyLogoBanner = ({ logo, action, method }: DailyLogoBannerProps): JSX.Element => (
  <form class="daily-logo" action={action} method={method}>
    <input type="hidden" name="q" value={logo.query} />
    <h1 class="daily-logo-heading">
      <button type="submit" class="daily-logo-link" title={logo.title}>
        <img class="daily-logo-image" src={logo.src} alt={logo.title} />
      </button>
    </h1>
  </form>
);
