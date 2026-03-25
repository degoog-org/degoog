import { state } from "../state";
import type {
  ImageColorFilter,
  ImageFilters,
  ImageLayoutFilter,
  ImageLicenseFilter,
  ImageSizeFilter,
  ImageTypeFilter,
} from "../types";
import { performSearch } from "./search-actions";

const FILTER_IDS = {
  bar: "image-tools-bar",
  size: "image-filter-size",
  color: "image-filter-color",
  type: "image-filter-type",
  layout: "image-filter-layout",
  license: "image-filter-license",
  clear: "image-filter-clear",
} as const;

const DEFAULT_FILTERS: ImageFilters = {
  size: "any",
  color: "any",
  type: "any",
  layout: "any",
  license: "any",
};

export function getDefaultImageFilters(): ImageFilters {
  return { ...DEFAULT_FILTERS };
}

export function parseImageFiltersFromParams(
  params: URLSearchParams,
): ImageFilters {
  return {
    size: _readFilter<ImageSizeFilter>(
      params.get("imgSize"),
      ["any", "icon", "medium", "large", "wallpaper"],
    ),
    color: _readFilter<ImageColorFilter>(
      params.get("imgColor"),
      [
        "any",
        "color",
        "grayscale",
        "transparent",
        "red",
        "orange",
        "yellow",
        "green",
        "teal",
        "blue",
        "purple",
        "pink",
        "white",
        "gray",
        "black",
        "brown",
      ],
    ),
    type: _readFilter<ImageTypeFilter>(params.get("imgType"), [
      "any",
      "photo",
      "clipart",
      "lineart",
      "gif",
    ]),
    layout: _readFilter<ImageLayoutFilter>(params.get("imgLayout"), [
      "any",
      "square",
      "wide",
      "tall",
    ]),
    license: _readFilter<ImageLicenseFilter>(params.get("imgLicense"), [
      "any",
      "any-cc",
      "commercial",
      "share",
    ]),
  };
}

export function applyImageFiltersToState(filters: ImageFilters): void {
  state.currentImageFilters = { ...DEFAULT_FILTERS, ...filters };
}

export function syncImageToolsBar(): void {
  const bar = document.getElementById(FILTER_IDS.bar);
  if (!bar) return;
  const active = state.currentType === "images";
  bar.toggleAttribute("hidden", !active);
  if (!active) return;

  _setSelectValue(FILTER_IDS.size, state.currentImageFilters.size);
  _setSelectValue(FILTER_IDS.color, state.currentImageFilters.color);
  _setSelectValue(FILTER_IDS.type, state.currentImageFilters.type);
  _setSelectValue(FILTER_IDS.layout, state.currentImageFilters.layout);
  _setSelectValue(FILTER_IDS.license, state.currentImageFilters.license);
}

export function initImageFilters(): void {
  syncImageToolsBar();

  _bindSelect(FILTER_IDS.size, "size");
  _bindSelect(FILTER_IDS.color, "color");
  _bindSelect(FILTER_IDS.type, "type");
  _bindSelect(FILTER_IDS.layout, "layout");
  _bindSelect(FILTER_IDS.license, "license");

  document.getElementById(FILTER_IDS.clear)?.addEventListener("click", () => {
    applyImageFiltersToState(getDefaultImageFilters());
    syncImageToolsBar();
    if (state.currentQuery && state.currentType === "images") {
      void performSearch(state.currentQuery, "images");
    }
  });
}

function _bindSelect(id: string, key: keyof ImageFilters): void {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  if (!select) return;
  select.addEventListener("change", () => {
    state.currentImageFilters = {
      ...state.currentImageFilters,
      [key]: select.value,
    } as ImageFilters;
    if (state.currentQuery && state.currentType === "images") {
      void performSearch(state.currentQuery, "images");
    }
  });
}

function _setSelectValue(id: string, value: string): void {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  if (select) select.value = value;
}

function _readFilter<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T {
  return allowed.includes((raw ?? "any") as T) ? (raw as T) : ("any" as T);
}
