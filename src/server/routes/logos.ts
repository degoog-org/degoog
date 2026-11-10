import { Hono } from "hono";
import { DAILY_LOGO_IMAGE_ROUTE } from "../../shared/daily-logo";
import { msUntilTomorrow, readLogoImage } from "../extensions/logos/daily";
import { logoVersion } from "../extensions/logos/present";
import { CSP_HEADER, SANDBOXED_IMAGE_CSP } from "../utils/security/content-policy";

const router = new Hono();

router.get(`${DAILY_LOGO_IMAGE_ROUTE}/:date/:id`, async (c) => {
  const date = c.req.param("date");
  const found = await readLogoImage(date, c.req.param("id"));
  if (!found) return c.json({ error: "Not found" }, 404);
  const etag = `"${logoVersion(date, found.logo)}"`;
  const headers = {
    "Cache-Control": `private, max-age=${Math.floor(msUntilTomorrow() / 1000)}`,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    [CSP_HEADER]: SANDBOXED_IMAGE_CSP,
  };
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304, headers);
  return c.body(found.bytes, 200, { ...headers, "Content-Type": found.logo.contentType });
});

export default router;
