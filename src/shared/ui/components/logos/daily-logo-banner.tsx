import type { DailyLogo } from "../../../daily-logo";

export const DailyLogoBanner = ({
  logo,
  src,
  action,
  method,
}: {
  logo: DailyLogo;
  src: string;
  action: string;
  method: string;
}): JSX.Element => (
  <form class="daily-logo" action={action} method={method}>
    <input type="hidden" name="q" value={logo.query} />
    <button type="submit" class="daily-logo-link" title={logo.title}>
      <img class="daily-logo-image" src={src} alt={logo.title} />
    </button>
  </form>
);
