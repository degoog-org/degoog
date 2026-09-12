import type { Context, MiddlewareHandler } from "hono";

const SLASH_METHODS = ["GET", "HEAD"];

const _routeMatched = (c: Context): boolean =>
  c.req.matchedRoutes.some(({ handler }) => handler.length < 2);

export const trimSlash = (): MiddlewareHandler => async (c, next) => {
  await next();

  if (c.res.status !== 404) return;
  if (!SLASH_METHODS.includes(c.req.method)) return;
  if (_routeMatched(c)) return;

  const { pathname, search } = new URL(c.req.url);
  if (pathname === "/" || !pathname.endsWith("/")) return;

  const trimmed = pathname.replace(/\/+$/, "") || "/";
  c.res = c.redirect(`${trimmed}${search}`, 301);
};
