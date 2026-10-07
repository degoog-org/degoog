import { isCropRect, type CropRect } from "./crop/crop-geometry";

export interface SearchImage {
  id: string;
  dataUrl: string;
  query?: string;
  queryText?: string;
  source?: string;
  crop?: CropRect;
}

const IMAGE_KEY_PREFIX = "degoog-search-image:";
const PENDING_KEY = "degoog-search-image-pending";
const KEPT_KEY = "degoog-search-image-kept";
const MAX_KEPT = 8;

const _key = (id: string): string => `${IMAGE_KEY_PREFIX}${id}`;

const _isDataUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("data:image/");

const _isImage = (value: unknown): value is SearchImage => {
  if (!value || typeof value !== "object") return false;
  const { id, dataUrl, source, crop } = value as Partial<SearchImage>;
  return (
    typeof id === "string" &&
    _isDataUrl(dataUrl) &&
    (source === undefined || _isDataUrl(source)) &&
    (crop === undefined || isCropRect(crop))
  );
};

export const newSearchImageId = (): string =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const _keptIds = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(KEPT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
};

const _forget = (ids: string[]): void => {
  for (const id of ids) sessionStorage.removeItem(_key(id));
};

export function keepSearchImage(image: SearchImage): void {
  const value = JSON.stringify(image);
  let kept = [..._keptIds().filter((id) => id !== image.id), image.id];
  try {
    _forget(kept.slice(0, -MAX_KEPT));
    kept = kept.slice(-MAX_KEPT);
    for (;;) {
      try {
        sessionStorage.setItem(_key(image.id), value);
        break;
      } catch (err) {
        if (kept.length <= 1) throw err;
        _forget(kept.slice(0, 1));
        kept = kept.slice(1);
      }
    }
    sessionStorage.setItem(KEPT_KEY, JSON.stringify(kept));
  } catch (err) {
    console.warn("[search-image] could not keep the image for this tab", err);
  }
}

export const readSearchImage = (id: unknown): SearchImage | null => {
  if (typeof id !== "string" || !id) return null;
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(_key(id)) ?? "null");
    return _isImage(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export function markPendingSearchImage(id: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, id);
  } catch (err) {
    console.warn("[search-image] could not hand the image to the results page", err);
  }
}

export const takePendingSearchImage = (): SearchImage | null => {
  try {
    const id = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return readSearchImage(id);
  } catch {
    return null;
  }
};
