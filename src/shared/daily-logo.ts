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
  image: string;
}

export const DAILY_LOGO_GLOBAL = "__DEGOOG_LOGO__";
export const DAILY_LOGO_IMAGE_ROUTE = "/api/logos/image";
