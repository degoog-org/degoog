import { Hono } from "hono";
import { LOGO_STATUS, type LogoStatusResponse } from "../../../../shared/daily-logo";
import {
  enabledOrForgetLogos,
  isLogoDayLoading,
  readLogoDay,
  refreshTodaysLogo,
} from "../../../extensions/logos/daily";
import { localizedLogoTitle } from "../../../extensions/logos/present";
import type { LogoDay } from "../../../types/logos";
import { getLocale } from "../../../utils/hono";
import { settingsAuth } from "../../_guards";

const router = new Hono();

const _describe = (day: LogoDay | null, locale?: string): LogoStatusResponse => {
  if (!day) {
    return { status: isLogoDayLoading() ? LOGO_STATUS.LOADING : LOGO_STATUS.UNCHECKED };
  }
  if (day.status !== LOGO_STATUS.OK) return { status: day.status };
  return { status: day.status, title: localizedLogoTitle(day.logo.title, locale) };
};

const DISABLED: LogoStatusResponse = { status: LOGO_STATUS.DISABLED };

router.get("/api/settings/logos", settingsAuth("GET /api/settings/logos"), async (c) => {
  if (!(await enabledOrForgetLogos())) return c.json(DISABLED);
  return c.json(_describe(await readLogoDay(), getLocale(c)));
});

router.post(
  "/api/settings/logos/refresh",
  settingsAuth("POST /api/settings/logos/refresh"),
  async (c) => {
    if (!(await enabledOrForgetLogos())) return c.json(DISABLED);
    return c.json(_describe(await refreshTodaysLogo(), getLocale(c)));
  },
);

export default router;
