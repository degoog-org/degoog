import { createHash } from "crypto";
import type { SearchImage } from "../types/search";
import { sniffFaviconType } from "../utils/security/favicon-bytes";
import {
  SEARCH_IMAGE_MAX_BYTES,
  SEARCH_IMAGE_QUERY_MAX_CHARS,
} from "../../shared/engine-input";

const DATA_URL_PREFIX = /^data:image\/[a-z0-9.+-]+;base64,/i;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const ACCEPTED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BASE64_CHARS = Math.ceil(SEARCH_IMAGE_MAX_BYTES / 3) * 4;

export const parseSearchImage = (raw: unknown): SearchImage | undefined => {
  if (typeof raw !== "string" || !raw) return undefined;
  const base64 = raw.replace(DATA_URL_PREFIX, "").replace(/\s+/g, "");
  if (!base64 || base64.length > MAX_BASE64_CHARS || !BASE64_RE.test(base64))
    return undefined;
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  const mime = sniffFaviconType(bytes);
  if (!mime || !ACCEPTED_MIMES.has(mime)) return undefined;
  return {
    bytes,
    mime,
    base64,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
};

export const parseImageQuery = (raw: unknown): string | undefined => {
  if (typeof raw !== "string") return undefined;
  const query = raw.replace(/\s+/g, " ").trim().slice(0, SEARCH_IMAGE_QUERY_MAX_CHARS);
  return query || undefined;
};

export const hasSearchInput = (query: unknown, image?: SearchImage): query is string =>
  typeof query === "string" && (!!image || query.trim().length > 0);

export const INVALID_IMAGE = {
  error: "The image could not be read",
  code: "invalidImage",
} as const;

export const rejectsImage = (
  body: { image?: unknown },
  parsed: { image?: SearchImage },
): boolean => body.image !== undefined && body.image !== "" && !parsed.image;
