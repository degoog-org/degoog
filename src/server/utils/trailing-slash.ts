import type { MiddlewareHandler } from "hono";

const SLASH_METHODS = ["GET", "HEAD"];

export const trimSlash = (): MiddlewareHandler => async (c, next) => {
  await next();

  if (c.res.status !== 404) return;
  if (!SLASH_METHODS.includes(c.req.method)) return;

  const { pathname, search } = new URL(c.req.url);
  if (pathname === "/" || !pathname.endsWith("/")) return;

  const trimmed = pathname.replace(/\/+$/, "") || "/";
  c.res = c.redirect(`${trimmed}${search}`, 301);
};
