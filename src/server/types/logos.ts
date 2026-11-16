import type { DailyLogoAuthor, LOGO_STATUS } from "../../shared/daily-logo";

export interface ManifestLogo {
  id: string;
  query: string;
  title: Record<string, string>;
  authors: DailyLogoAuthor[];
  image: string;
}

export interface ManifestDay {
  commit: string;
  logos: ManifestLogo[];
}

export interface FetchedLogoImage {
  bytes: Uint8Array;
  contentType: string;
}

export interface StoredLogo extends ManifestLogo {
  commit: string;
  contentType: string;
}

export type LogoDay =
  | { status: typeof LOGO_STATUS.OK; logo: StoredLogo }
  | { status: typeof LOGO_STATUS.NONE }
  | { status: typeof LOGO_STATUS.FAILED };

export interface LoadedLogoDay {
  day: LogoDay;
  image?: Uint8Array;
}

export interface TodaysLogo {
  date: string;
  logo: StoredLogo;
}

export interface ServedLogoImage {
  logo: StoredLogo;
  bytes: Uint8Array<ArrayBuffer>;
}
