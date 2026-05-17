import { Hono, type Context } from "hono";
import { getTraps } from "../extensions/honeypot/registry";
import { blockIp, honeypotOn } from "../utils/bot-trap";
import { getClientIp } from "../utils/request";
import { logger } from "../utils/logger";
import { getBaseUrl } from "../utils/base-url";

import "../extensions/honeypot/builtins/wp-trap";
import "../extensions/honeypot/builtins/env-trap";
import "../extensions/honeypot/builtins/php-trap";
import "../extensions/honeypot/builtins/js-trap";
import "../extensions/honeypot/builtins/api-trap";

const router = new Hono();

const wrapTrap = (
  trapRespond: (c: Context) => Response | Promise<Response>,
) =>
  async (c: Context): Promise<Response> => {
    if (!(await honeypotOn())) return c.text("Not Found", 404);
    const ip = getClientIp(c) ?? "unknown";
    logger.warn("honeypot", `trap hit: ${c.req.path} from ${ip}`);
    await blockIp(ip);
    return trapRespond(c);
  };

for (const trap of getTraps()) {
  const handler = wrapTrap(trap.respond);
  for (const path of trap.paths) {
    router.on(["GET", "POST"], path, handler);
  }
}

router.get("/sitemap.xml", async (c) => {
  if (!(await honeypotOn())) return c.text("Not Found", 404);
  const base = getBaseUrl() ?? "";
  const allPaths = getTraps().flatMap((t) => t.paths);
  const entries = allPaths
    .map(
      (p) =>
        `  <url>\n    <loc>${base}${p}</loc>\n    <priority>1.0</priority>\n    <changefreq>daily</changefreq>\n  </url>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
  return c.text(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
});

export default router;
