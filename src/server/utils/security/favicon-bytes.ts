export const FAVICON_MAX_BYTES = 64 * 1024;

export interface FaviconBytes {
  data: Uint8Array;
  contentType: string;
}

interface Signature {
  contentType: string;
  matches: (bytes: Uint8Array) => boolean;
}

const _startsWith = (bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + prefix.length &&
  prefix.every((byte, i) => bytes[offset + i] === byte);

const _ascii = (text: string): number[] => Array.from(text, (ch) => ch.charCodeAt(0));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const ICO = [0x00, 0x00, 0x01, 0x00] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;
const GIF87 = _ascii("GIF87a");
const GIF89 = _ascii("GIF89a");
const RIFF = _ascii("RIFF");
const WEBP = _ascii("WEBP");
const FTYP = _ascii("ftyp");
const AVIF_BRAND = _ascii("avi");

const SIGNATURES: readonly Signature[] = [
  { contentType: "image/png", matches: (b) => _startsWith(b, PNG) },
  { contentType: "image/x-icon", matches: (b) => _startsWith(b, ICO) },
  { contentType: "image/gif", matches: (b) => _startsWith(b, GIF87) || _startsWith(b, GIF89) },
  { contentType: "image/jpeg", matches: (b) => _startsWith(b, JPEG) },
  { contentType: "image/webp", matches: (b) => _startsWith(b, RIFF) && _startsWith(b, WEBP, 8) },
  { contentType: "image/avif", matches: (b) => _startsWith(b, FTYP, 4) && _startsWith(b, AVIF_BRAND, 8) },
];

const FAVICON_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/x-icon",
  "image/gif",
  "image/jpeg",
  "image/webp",
]);

export const sniffImageType = (bytes: Uint8Array, allowed: ReadonlySet<string>): string | null =>
  SIGNATURES.find((sig) => allowed.has(sig.contentType) && sig.matches(bytes))?.contentType ?? null;

export const sniffFaviconType = (bytes: Uint8Array): string | null =>
  sniffImageType(bytes, FAVICON_TYPES);

export const validateFavicon = (bytes: Uint8Array): FaviconBytes | null => {
  if (bytes.byteLength === 0 || bytes.byteLength > FAVICON_MAX_BYTES) return null;
  const contentType = sniffFaviconType(bytes);
  return contentType ? { data: bytes, contentType } : null;
};
