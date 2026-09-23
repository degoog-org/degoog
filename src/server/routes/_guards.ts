import type { MiddlewareHandler } from "hono";
import { canBalrogPass, gandalf } from "./settings-auth";
import { logger } from "../utils/logger";

export const settingsAuth = (route?: string): MiddlewareHandler =>
  async (c, next) => {
    if (!(await gandalf(canBalrogPass(c)))) {
      if (route) logger.debug("settings-auth", `401 on ${route}`);
      return c.json({ error: "You shall not pass!" }, 401);
    }
    return next();
  };
