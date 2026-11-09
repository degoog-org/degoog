import { outgoingFetch } from "../../utils/net/outgoing";
import { readBodyCapped } from "../../utils/net/read-body";
import { getRandomUserAgent } from "../../utils/net/user-agents";
import { sniffFaviconType } from "../../utils/security/favicon-bytes";

export interface LogoImage {
  bytes: Uint8Array;
  contentType: string;
}

const DEDOODLES_RAW_URL = "https://raw.githubusercontent.com/degoog-org/dedoodles";
const MANIFEST_URL = `${DEDOODLES_RAW_URL}/main/manifest.json`;
const FETCH_TIMEOUT_MS = 10_000;
const BODY_IDLE_MS = 5_000;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const AVIF_TYPE = "image/avif";

const _ascii = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, to));

const _isAvif = (bytes: Uint8Array): boolean =>
  _ascii(bytes, 4, 8) === "ftyp" && _ascii(bytes, 8, 11) === "avi";

const _sniffImageType = (bytes: Uint8Array): string | null => {
  const type = sniffFaviconType(bytes);
  if (type) return LOGO_TYPES.has(type) ? type : null;
  return _isAvif(bytes) ? AVIF_TYPE : null;
};

const _fetchCapped = async (url: string, cap: number): Promise<Uint8Array> => {
  const res = await outgoingFetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": getRandomUserAgent() },
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`dedoodles answered ${res.status}`);
  }
  const body = await readBodyCapped(res, cap, BODY_IDLE_MS);
  if (body === "too-large") throw new Error("dedoodles sent more than expected");
  if (body === "empty") throw new Error("dedoodles sent an empty body");
  return new Uint8Array(body);
};

export const fetchLogoManifest = async (): Promise<unknown> => {
  const bytes = await _fetchCapped(MANIFEST_URL, MAX_MANIFEST_BYTES);
  return JSON.parse(new TextDecoder().decode(bytes));
};

export const fetchLogoImage = async (commit: string, path: string): Promise<LogoImage> => {
  const bytes = await _fetchCapped(`${DEDOODLES_RAW_URL}/${commit}/${path}`, MAX_IMAGE_BYTES);
  const contentType = _sniffImageType(bytes);
  if (!contentType) throw new Error(`${path} is not a supported image`);
  return { bytes, contentType };
};
