import type { Context } from "hono";
import { getBasePath, getBaseUrl } from "./base-url";
import { logger } from "./logger";
import { isProxyTrusted } from "./request";

interface PublicReq {
  url: string;
  proto?: string;
  host?: string;
}

const _first = (value: string | undefined): string =>
  (value ?? "").split(",")[0].trim();

const _origin = (configured: string): string => {
  if (!configured || !/^https?:\/\//i.test(configured)) return "";
  try {
    return new URL(configured).origin;
  } catch (err) {
    logger.debug("public-url", `invalid DEGOOG_BASE_URL "${configured}"`, err);
    return "";
  }
};

export const buildPublicUrl = (
  configured: string,
  basePath: string,
  req: PublicReq,
): string => {
  const fixed = _origin(configured);
  if (fixed) return `${fixed}${basePath}`;

  const url = new URL(req.url);
  const proto = _first(req.proto) || url.protocol.replace(":", "");
  const host = _first(req.host) || url.host;

  return `${proto}://${host}${basePath}`;
};

export const getPublicUrl = (c: Context): string =>
  buildPublicUrl(getBaseUrl(), getBasePath(), {
    url: c.req.url,
    ...(isProxyTrusted()
      ? {
          proto: c.req.header("x-forwarded-proto"),
          host: c.req.header("x-forwarded-host") ?? c.req.header("host"),
        }
      : {}),
  });
