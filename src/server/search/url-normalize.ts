const TRACKING_PARAMS = new Set([
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "yclid",
  "ttclid",
  "twclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "igshid",
  "_ga",
  "_gl",
  "vero_id",
  "vero_conv",
  "wt_mc",
]);

import { logger } from "../utils/logger";
import { applyClearUrls } from "./clearurls";

export const cleanUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    const keys = Array.from(parsed.searchParams.keys());
    for (const k of keys) {
      const lk = k.toLowerCase();
      if (lk.startsWith("utm_") || TRACKING_PARAMS.has(lk)) {
        parsed.searchParams.delete(k);
      }
    }
    // The static list above is the floor and runs even when the ruleset has not loaded. ClearURLs
    // adds the site-specific rules and unwraps redirector links on top of it.
    const cleaned = applyClearUrls(parsed.href);
    return cleaned.replace(/\/+$/, "");
  } catch (err) {
    logger.debug("search", `cleanUrl failed for "${url}"`, err);
    return url;
  }
};

export const normalizeUrl = (url: string): string => {
  try {
    const cleaned = cleanUrl(url);
    const parsed = new URL(cleaned);
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return parsed.href.replace(/\/+$/, "");
  } catch (err) {
    logger.debug("search", `normalizeUrl failed for "${url}"`, err);
    return url;
  }
};

export const urlIsGif = (url?: string): boolean =>
  !!url && url.split(/[?#]/, 1)[0].toLowerCase().endsWith(".gif");
