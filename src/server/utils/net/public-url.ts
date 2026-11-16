import type { Context } from "hono";
import { getBasePath, getBaseUrl } from "./base-url";
import { logger } from "../logger";
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

let _warnedMissingBaseUrl = false;

function _warnIfProxiedWithoutBaseUrl(c: Context): void {
  if (_warnedMissingBaseUrl || _origin(getBaseUrl())) return;
  const forwarded = _first(c.req.header("x-forwarded-proto")).toLowerCase();
  if (forwarded !== "https" || new URL(c.req.url).protocol === "https:") return;
  _warnedMissingBaseUrl = true;
  logger.warn(
    "public-url",
    "request arrived through an https proxy but DEGOOG_BASE_URL is not a full URL, so public links such as /opensearch.xml are advertised as http://. " +
      "Set DEGOOG_BASE_URL to the public URL, e.g. https://search.example.com",
  );
}

export const getPublicUrl = (c: Context): string => {
  const trusted = isProxyTrusted();
  if (!trusted) _warnIfProxiedWithoutBaseUrl(c);
  return buildPublicUrl(getBaseUrl(), getBasePath(), {
    url: c.req.url,
    ...(trusted
      ? {
          proto: c.req.header("x-forwarded-proto"),
          host: c.req.header("x-forwarded-host") ?? c.req.header("host"),
        }
      : {}),
  });
};
