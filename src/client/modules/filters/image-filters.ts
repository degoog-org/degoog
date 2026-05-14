import { state } from "../../state";

const FILTER_BAR_ID = "image-filters-bar";

const FILTER_GROUPS: {
  key: string;
  opts: { value: string; label: string }[];
}[] = [
  {
    key: "size",
    opts: [
      { value: "any", label: "Size" },
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
      { value: "wallpaper", label: "Wallpaper" },
    ],
  },
  {
    key: "color",
    opts: [
      { value: "any", label: "Color" },
      { value: "monochrome", label: "B&W" },
      { value: "red", label: "Red" },
      { value: "orange", label: "Orange" },
      { value: "yellow", label: "Yellow" },
      { value: "green", label: "Green" },
      { value: "teal", label: "Teal" },
      { value: "blue", label: "Blue" },
      { value: "purple", label: "Purple" },
      { value: "pink", label: "Pink" },
      { value: "brown", label: "Brown" },
      { value: "gray", label: "Gray" },
      { value: "black", label: "Black" },
      { value: "white", label: "White" },
    ],
  },
  {
    key: "type",
    opts: [
      { value: "any", label: "Type" },
      { value: "photo", label: "Photo" },
      { value: "clipart", label: "Clipart" },
      { value: "lineart", label: "Line art" },
      { value: "animated", label: "Animated" },
    ],
  },
  {
    key: "layout",
    opts: [
      { value: "any", label: "Layout" },
      { value: "square", label: "Square" },
      { value: "wide", label: "Wide" },
      { value: "tall", label: "Tall" },
    ],
  },
  {
    key: "nsfw",
    opts: [
      { value: "any", label: "SafeSearch" },
      { value: "on", label: "Strict" },
      { value: "moderate", label: "Moderate" },
      { value: "off", label: "Off" },
    ],
  },
];

const renderSelect = (
  key: string,
  opts: { value: string; label: string }[],
  active: string,
): string => {
  const options = opts
    .map(
      ({ value, label }) =>
        `<option value="${value}"${value === (active || "any") ? " selected" : ""}>${label}</option>`,
    )
    .join("");
  return `<div class="degoog-select-wrap degoog-img-filter-select-wrap"><select class="degoog-input degoog-input--md" data-filter-key="${key}">${options}</select></div>`;
};

const renderBar = (): string =>
  FILTER_GROUPS.map(({ key, opts }) =>
    renderSelect(
      key,
      opts,
      (state.imageFilter as Record<string, string>)[key] || "any",
    ),
  ).join("");

type SearchFn = (query: string, type: string) => void;

export const initImgFilters = (onSearch: SearchFn): void => {
  const bar = document.getElementById(FILTER_BAR_ID);
  if (!bar) return;

  bar.innerHTML = `<div class="degoog-img-filter-bar">${renderBar()}</div>`;

  bar.addEventListener("change", (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>(
      "select[data-filter-key]",
    );
    if (!sel) return;
    const key = sel.dataset.filterKey;
    const val = sel.value;
    if (!key) return;

    (state.imageFilter as Record<string, string>)[key] =
      val === "any" ? "" : val;

    if (state.currentQuery) {
      onSearch(state.currentQuery, state.currentType);
    }
  });
};

export const syncImgFilters = (type: string): void => {
  const bar = document.getElementById(FILTER_BAR_ID);
  if (!bar) return;
  bar.style.display = type === "images" ? "block" : "none";
};
