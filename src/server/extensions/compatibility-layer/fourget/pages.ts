import { logger } from "../../../utils/logger";

const NS = "4get-compat";

export interface FourGetPage {
  type: string;
  method: string;
  filters: string;
}

/**
 * `method` and `filters` are 4get's, fixed by upstream. `type` is a guess.
 *
 * Degoog ships with no engines and therefore no types at all, so there is no
 * canonical "images" for us to conform to. The names below are the ones the
 * official store's engines happen to use, which makes them the tabs a user is
 * most likely to already have by the time they turn this layer on. Standardising
 * on them is the path of least resistance, not a rule: anything that disagrees
 * is one searchTypeOverride away from landing wherever its owner wants.
 */
export const FOURGET_PAGES: readonly FourGetPage[] = Object.freeze([
  { type: "web", method: "web", filters: "web" },
  { type: "images", method: "image", filters: "images" },
  { type: "videos", method: "video", filters: "videos" },
  { type: "news", method: "news", filters: "news" },
  { type: "music", method: "music", filters: "music" },
]);

export const mapPages = (
  pages: readonly FourGetPage[],
  override: string | null,
): Map<string, FourGetPage> => {
  const renamed = override
    ? override.split(",").map((type) => type.trim())
    : [];
  const out = new Map<string, FourGetPage>();
  pages.forEach((page, index) => {
    const rename = renamed[index];
    if (rename) out.set(rename, page);
  });
  pages.forEach((page, index) => {
    if (renamed[index]) return;
    if (out.has(page.type)) {
      logger.warn(
        NS,
        `the ${page.method} page has no tab left, an override already renamed another page to "${page.type}"`,
      );
      return;
    }
    out.set(page.type, page);
  });
  return out;
};
