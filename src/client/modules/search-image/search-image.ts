import type { SearchBody } from "../../../server/types/search";
import { imageSearchAvailable } from "./search-image-availability";
import {
  barImage,
  HOME_INPUT_ID,
  mountSearchImageBars,
  onSearchImageSubmit,
  pickSearchImage,
  RESULTS_INPUT_ID,
  setBarImage,
} from "./search-image-bar";
import {
  keepSearchImage,
  markPendingSearchImage,
  readSearchImage,
  takePendingSearchImage,
  type SearchImage,
} from "./search-image-store";

export const IMAGE_SEARCH_TYPE = "images";

export { HOME_INPUT_ID, onSearchImageSubmit, RESULTS_INPUT_ID };

let _ready: Promise<boolean> | null = null;

function _mount(): void {
  if (!mountSearchImageBars()) return;
  window.degoog = { ...(window.degoog ?? {}), pickImage: pickSearchImage };
}

export const initSearchImage = (): Promise<boolean> => {
  _ready ??= imageSearchAvailable().then((available) => {
    if (available) _mount();
    return available;
  });
  return _ready;
};

export const currentSearchImage = (): SearchImage | null => barImage(RESULTS_INPUT_ID);

export const homeSearchImage = (): SearchImage | null => barImage(HOME_INPUT_ID);

export function useSearchImage(image: SearchImage | null): void {
  if (image) {
    keepSearchImage(image);
    _mount();
  }
  setBarImage(RESULTS_INPUT_ID, image);
}

export function handOffHomeImage(image: SearchImage): void {
  keepSearchImage(image);
  markPendingSearchImage(image.id);
}

export const restoreSearchImage = (historyImageId: unknown): SearchImage | null =>
  takePendingSearchImage() ?? readSearchImage(historyImageId);

export const IMAGE_QUERY_EVENT = "degoog-image-query";

let _queryError: string | null = null;

export const withSearchImage = <T extends SearchBody>(body: T): T => {
  const image = currentSearchImage();
  if (!image) return body;
  return image.query && image.queryText === body.query.trim()
    ? { ...body, image: image.dataUrl, imageQuery: image.query }
    : { ...body, image: image.dataUrl };
};

export function beginImageQuery(): void {
  _queryError = null;
}

export const imageQueryError = (): string | null => _queryError;

export function noteImageQuery(
  text: string,
  query: string | null | undefined,
  error: string | null | undefined,
): void {
  const image = currentSearchImage();
  if (!image) return;
  _queryError = error || null;
  if (query && (image.query !== query || image.queryText !== text.trim())) {
    useSearchImage({ ...image, query, queryText: text.trim() });
  } else if (!query && image.query) {
    useSearchImage({ id: image.id, dataUrl: image.dataUrl });
  }
  window.dispatchEvent(
    new CustomEvent(IMAGE_QUERY_EVENT, {
      detail: { query: query ?? null, error: _queryError },
    }),
  );
}
