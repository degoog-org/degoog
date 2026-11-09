import { Hono } from "hono";
import { DAILY_LOGO_IMAGE_ROUTE } from "../../shared/daily-logo";
import { msUntilTomorrow, readLogoImage } from "../extensions/logos/daily";
import { logoVersion } from "../extensions/logos/present";

const router = new Hono();

const LOGO_IMAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

router.get(`${DAILY_LOGO_IMAGE_ROUTE}/:date/:id`, async (c) => {
  const date = c.req.param("date");
  const found = await readLogoImage(date, c.req.param("id"));
  if (!found) return c.json({ error: "Not found" }, 404);
  const etag = `"${logoVersion(date, found.logo)}"`;
  const headers = {
    "Cache-Control": `private, max-age=${Math.floor(msUntilTomorrow() / 1000)}`,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": LOGO_IMAGE_CSP,
  };
  if (c.req.header("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(found.bytes, {
    status: 200,
    headers: { ...headers, "Content-Type": found.logo.contentType },
  });
});

export default router;
