import {
  DAILY_LOGO_DEFAULT_LOCALE,
  DAILY_LOGO_IMAGE_ROUTE,
  type DailyLogo,
} from "../../../shared/daily-logo";
import { basePrefix } from "../../render/theme-assets";
import type { StoredLogo, TodaysLogo } from "../../types/logos";

const _language = (locale: string): string => locale.split("-")[0].toLowerCase();

export const localizedLogoTitle = (title: Record<string, string>, locale?: string): string => {
  if (locale && title[locale]) return title[locale];
  if (locale) {
    const language = _language(locale);
    const sameLanguage = Object.keys(title).find((key) => _language(key) === language);
    if (sameLanguage) return title[sameLanguage];
  }
  return title[DAILY_LOGO_DEFAULT_LOCALE] ?? Object.values(title)[0] ?? "";
};

export const logoVersion = (date: string, logo: StoredLogo): string =>
  `${logo.commit.slice(0, 12)}-${date}-${logo.id}`;

const _logoImageSrc = (date: string, logo: StoredLogo): string =>
  `${basePrefix()}${DAILY_LOGO_IMAGE_ROUTE}/${date}/${logo.id}?v=${encodeURIComponent(logoVersion(date, logo))}`;

export const toDailyLogo = ({ date, logo }: TodaysLogo, locale?: string): DailyLogo => ({
  date,
  id: logo.id,
  query: logo.query,
  title: localizedLogoTitle(logo.title, locale),
  authors: logo.authors,
  src: _logoImageSrc(date, logo),
});
