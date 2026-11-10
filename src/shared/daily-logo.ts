export interface DailyLogoAuthor {
  name: string;
  url?: string;
}

export interface DailyLogo {
  date: string;
  id: string;
  query: string;
  title: string;
  authors: DailyLogoAuthor[];
  src: string;
}

export const LOGO_STATUS = {
  OK: "ok",
  NONE: "none",
  FAILED: "failed",
  DISABLED: "disabled",
  LOADING: "loading",
  UNCHECKED: "unchecked",
} as const;

export type LogoStatus = (typeof LOGO_STATUS)[keyof typeof LOGO_STATUS];

export interface LogoStatusResponse {
  status: LogoStatus;
  title?: string;
}

export const DAILY_LOGO_GLOBAL = "__DEGOOG_LOGO__";
export const DAILY_LOGO_IMAGE_ROUTE = "/api/logos/image";
export const DAILY_LOGO_DEFAULT_LOCALE = "en-US";
