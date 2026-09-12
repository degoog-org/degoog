import type { Context } from "hono";
import { logger } from "./logger";

interface BunEnv {
  requestIP?: (req: Request) => { address: string } | null;
}

export const isProxyTrusted = (): boolean => {
  const v = process.env.DEGOOG_DISTRUST_PROXY;
  if (v === undefined) return false;
  return v === "false" || v === "0";
};

export function getClientIp(c: Context): string | undefined {
  if (isProxyTrusted()) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    const realIp = c.req.header("x-real-ip");
    if (realIp) return realIp;
  }
  const env = c.env as BunEnv | undefined;
  return env?.requestIP?.(c.req.raw)?.address ?? undefined;
}

export function isHttpsRequest(c: Context): boolean {
  if (isProxyTrusted()) {
    const proto = c.req.header("x-forwarded-proto");
    if (proto) return proto.split(",")[0].trim().toLowerCase() === "https";
  }
  try {
    return new URL(c.req.url).protocol === "https:";
  } catch (err) {
    logger.debug("request", "isHttpsRequest URL parse failed", err);
    return false;
  }
}
