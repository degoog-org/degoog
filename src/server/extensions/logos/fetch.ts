import type { FetchedLogoImage } from "../../types/logos";
import { outgoingFetch } from "../../utils/net/outgoing";
import { readBodyCapped } from "../../utils/net/read-body";
import { getRandomUserAgent } from "../../utils/net/user-agents";
import { sniffImageType } from "../../utils/security/favicon-bytes";

const DEDOODLES_RAW_URL = "https://raw.githubusercontent.com/degoog-org/dedoodles";
const MANIFEST_URL = `${DEDOODLES_RAW_URL}/main/manifest.json`;
const FETCH_TIMEOUT_MS = 10_000;
const BODY_IDLE_MS = 5_000;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
const LOGO_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
]);

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

export const fetchLogoImage = async (commit: string, path: string): Promise<FetchedLogoImage> => {
  const bytes = await _fetchCapped(`${DEDOODLES_RAW_URL}/${commit}/${path}`, MAX_IMAGE_BYTES);
  const contentType = sniffImageType(bytes, LOGO_TYPES);
  if (!contentType) throw new Error(`${path} is not a supported image`);
  return { bytes, contentType };
};
