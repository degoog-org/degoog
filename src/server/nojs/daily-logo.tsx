import type { Context } from "hono";
import type { DailyLogo } from "../../shared/daily-logo";
import { DailyLogoBanner } from "../../shared/ui/components/logos/daily-logo-banner";
import { DailyLogoCredit } from "../../shared/ui/components/logos/daily-logo-credit";
import { DailyLogoMini } from "../../shared/ui/components/logos/daily-logo-mini";
import { renderHtml } from "../../shared/ui/tribute/html";
import { todaysLogo } from "../extensions/logos/daily";
import { toDailyLogo } from "../extensions/logos/present";
import type { Translate } from "../types/extension";
import { nojsFormMethod, nojsSearchAction } from "./links";

export const nojsDailyLogo = async (locale: string): Promise<DailyLogo | null> => {
  const today = await todaysLogo();
  return today ? toDailyLogo(today, locale) : null;
};

export const renderNojsDailyLogo = async (c: Context, logo: DailyLogo): Promise<string> =>
  renderHtml(
    <DailyLogoBanner logo={logo} action={nojsSearchAction(c)} method={await nojsFormMethod()} />,
  );

export const renderNojsDailyLogoCredit = (logo: DailyLogo, t: Translate, locale: string): string =>
  renderHtml(
    <DailyLogoCredit
      authors={logo.authors}
      prefix={String(t("daily-logo.credit-prefix", undefined, locale))}
    />,
  );

export const renderNojsDailyLogoMini = async (locale: string): Promise<string | null> => {
  const logo = await nojsDailyLogo(locale);
  return logo ? renderHtml(<DailyLogoMini logo={logo} />) : null;
};
