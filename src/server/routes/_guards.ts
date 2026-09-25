import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { canBalrogPass, gandalf } from "./settings/settings-auth";
import { logger } from "../utils/logger";
import { asString } from "../utils/settings/plugin-settings";
import { getInstanceSettings } from "../utils/settings/server-settings";

export const settingsAuth = (route?: string): MiddlewareHandler =>
  async (c, next) => {
    if (!(await gandalf(canBalrogPass(c)))) {
      if (route) logger.debug("settings-auth", `401 on ${route}`);
      return c.json({ error: "You shall not pass!" }, 401);
    }
    return next();
  };

const _requestBodyMaxBytes = async (): Promise<number> => {
  const settings = await getInstanceSettings();
  const kb = parseInt(asString(settings.requestBodyMaxKb), 10);
  return Number.isFinite(kb) && kb > 0 ? kb * 1024 : 0;
};

export const publicBodyLimit: MiddlewareHandler = async (c, next) => {
  const maxSize = await _requestBodyMaxBytes();
  if (!maxSize) return next();
  return bodyLimit({
    maxSize,
    onError: (ctx) => ctx.json({ error: "Request body too large" }, 413),
  })(c, next);
};
