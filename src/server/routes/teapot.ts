import { type Context, Hono } from "hono";

import { getThemeHtml } from "../extensions/themes/registry";
import { getBasePath } from "../utils/net/base-url";
import { getLocale } from "../utils/hono";
import { _applyRateLimit } from "../utils/search";
import { buildLayoutPage, buildThemedLayoutPage } from "./pages/render";
import {
  brewTea,
  htcpcpHeaders,
  isTeaMessage,
  isTeaVariety,
  MEDIA_TEA,
  noAdditions,
  potProps,
  refuseCoffee,
  sayWhen,
  teaMenu,
  teapotOptions,
  wantsAdditions,
  TEAPOT_STATUS_TEXT,
} from "./teapot-htcpcp";

const HTML_CONTENT_TYPE = "text/html; charset=UTF-8";

const router = new Hono();

router.use("*", async (c, next) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  await next();
});

const wantsHtml = (c: Context): boolean =>
  c.req.header("Sec-Fetch-Dest") === "document" ||
  (c.req.header("Accept") ?? "").includes("text/html");

const buildTeapotPage = async (locale?: string): Promise<string> => {
  const override = await getThemeHtml("teapot");
  if (override) return buildThemedLayoutPage(override, locale);
  return buildLayoutPage("easter-eggs/teapot.html", locale);
};

const showTeapot = async (c: Context): Promise<Response> => {
  if (c.req.method === "HEAD") {
    return refuseCoffee(null, wantsHtml(c) ? HTML_CONTENT_TYPE : MEDIA_TEA);
  }
  if (c.req.method === "GET" && wantsHtml(c)) {
    const html = await buildTeapotPage(getLocale(c));
    return new Response(html, {
      status: 418,
      statusText: TEAPOT_STATUS_TEXT,
      headers: htcpcpHeaders(HTML_CONTENT_TYPE, { Safe: "no" }),
    });
  }
  return refuseCoffee();
};

const brewRoot = async (c: Context): Promise<Response> => {
  if (wantsAdditions(c.req.header("Accept-Additions"))) return noAdditions();
  if (isTeaMessage(c.req.header("Content-Type"))) return teaMenu(getBasePath());
  return refuseCoffee();
};

const brewVariety = async (c: Context): Promise<Response> => {
  const variety = c.req.param("variety");
  const type = c.req.header("Content-Type");
  if (!variety || !isTeaVariety(variety)) {
    return isTeaMessage(type) ? c.notFound() : refuseCoffee();
  }
  if (wantsAdditions(c.req.header("Accept-Additions"))) return noAdditions();
  if (!isTeaMessage(type)) return refuseCoffee();
  return brewTea(await c.req.text());
};

router.on(["GET", "HEAD"], "/teapot", showTeapot);
router.options("/teapot", () => teapotOptions());
router.on(["BREW", "POST"], "/teapot", brewRoot);
router.on(["BREW", "POST"], "/teapot/:variety", brewVariety);
router.on("WHEN", "/teapot", () => sayWhen());
router.on("WHEN", "/teapot/:variety", () => sayWhen());
router.on("PROPFIND", "/teapot", () => potProps());
router.on("PROPFIND", "/teapot/:variety", () => potProps());

export default router;
