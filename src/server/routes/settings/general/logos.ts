import { Hono } from "hono";
import {
  LOGO_DAY_STATUS,
  enabledOrForgetLogos,
  isLogoDayLoading,
  logoDateKey,
  readLogoDay,
  refreshTodaysLogo,
  type LogoDay,
} from "../../../extensions/logos/daily";
import { localizedLogoTitle } from "../../../extensions/logos/present";
import { getLocale } from "../../../utils/hono";
import { settingsAuth } from "../../_guards";

export const LOGO_STATUS = {
  ...LOGO_DAY_STATUS,
  DISABLED: "disabled",
  LOADING: "loading",
  UNCHECKED: "unchecked",
} as const;

type LogoStatus = (typeof LOGO_STATUS)[keyof typeof LOGO_STATUS];

interface LogoStatusResponse {
  date: string;
  status: LogoStatus;
  title?: string;
  query?: string;
}

const router = new Hono();

const _describe = (date: string, day: LogoDay | null, locale?: string): LogoStatusResponse => {
  if (!day) {
    return {
      date,
      status: isLogoDayLoading(date) ? LOGO_STATUS.LOADING : LOGO_STATUS.UNCHECKED,
    };
  }
  if (day.status !== LOGO_DAY_STATUS.OK) return { date, status: day.status };
  return {
    date,
    status: day.status,
    title: localizedLogoTitle(day.logo.title, locale),
    query: day.logo.query,
  };
};

const _disabled = (): LogoStatusResponse => ({
  date: logoDateKey(),
  status: LOGO_STATUS.DISABLED,
});

router.get("/api/settings/logos", settingsAuth("GET /api/settings/logos"), async (c) => {
  if (!(await enabledOrForgetLogos())) return c.json(_disabled());
  const date = logoDateKey();
  return c.json(_describe(date, await readLogoDay(date), getLocale(c)));
});

router.post(
  "/api/settings/logos/refresh",
  settingsAuth("POST /api/settings/logos/refresh"),
  async (c) => {
    if (!(await enabledOrForgetLogos())) return c.json(_disabled());
    const day = await refreshTodaysLogo();
    return c.json(_describe(logoDateKey(), day, getLocale(c)));
  },
);

export default router;
