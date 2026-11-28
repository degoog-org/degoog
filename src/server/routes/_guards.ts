import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { gandalfAtTheGate } from "./settings/settings-auth";
import { logger } from "../utils/logger";
import type { PluginRoute, PluginRouteContext } from "../types/extension";
import { asString } from "../utils/settings/plugin-settings";
import { getInstanceSettings } from "../utils/settings/server-settings";

export const settingsAuth = (route?: string): MiddlewareHandler =>
  async (c, next) => {
    if (!(await gandalfAtTheGate(c))) {
      if (route) logger.debug("settings-auth", `401 on ${route}`);
      return c.json({ error: "You shall not pass!" }, 401);
    }
    return next();
  };

export const openRouteGate = async (
  c: Context,
  route: PluginRoute,
  label: string,
): Promise<PluginRouteContext | Response> => {
  const authenticated = await gandalfAtTheGate(c);
  if (route.auth && !authenticated) {
    logger.debug("settings-auth", `401 on ${label}`);
    return c.json({ error: "You shall not pass!" }, 401);
  }
  return { authenticated };
};

export const DEFAULT_BODY_SIZE_KB = 3072;

export const envBodySizeKb = (raw: string | undefined = process.env.DEGOOG_BODY_SIZE): number => {
  const kb = parseInt(raw?.trim() ?? "", 10);
  return Number.isFinite(kb) && kb >= 0 ? kb : DEFAULT_BODY_SIZE_KB;
};

const _requestBodyMaxBytes = async (): Promise<number> => {
  const settings = await getInstanceSettings();
  const kb = parseInt(asString(settings.requestBodyMaxKb), 10);
  return (Number.isFinite(kb) && kb > 0 ? kb : envBodySizeKb()) * 1024;
};

export const publicBodyLimit: MiddlewareHandler = async (c, next) => {
  const maxSize = await _requestBodyMaxBytes();
  if (!maxSize) return next();
  return bodyLimit({
    maxSize,
    onError: (ctx) => ctx.json({ error: "Request body too large" }, 413),
  })(c, next);
};
