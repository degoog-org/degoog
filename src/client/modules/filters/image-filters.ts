import { state } from "../../state";

const FILTER_BAR_ID = "image-filters-bar";
const T_NS = "themes/degoog";
const T_PFX = "search-templates.image-filters";

const t = window.scopedT(T_NS);
const tf = (key: string): string => t(`${T_PFX}.${key}`);

const FILTER_GROUPS: {
  key: string;
  opts: { value: string; label: string }[];
}[] = [
  {
    key: "size",
    opts: [
      { value: "any", label: tf("size") },
      { value: "small", label: tf("small") },
      { value: "medium", label: tf("medium") },
      { value: "large", label: tf("large") },
      { value: "wallpaper", label: tf("wallpaper") },
    ],
  },
  {
    key: "color",
    opts: [
      { value: "any", label: tf("color") },
      { value: "monochrome", label: tf("bw") },
      { value: "red", label: tf("red") },
      { value: "orange", label: tf("orange") },
      { value: "yellow", label: tf("yellow") },
      { value: "green", label: tf("green") },
      { value: "teal", label: tf("teal") },
      { value: "blue", label: tf("blue") },
      { value: "purple", label: tf("purple") },
      { value: "pink", label: tf("pink") },
      { value: "brown", label: tf("brown") },
      { value: "gray", label: tf("gray") },
      { value: "black", label: tf("black") },
      { value: "white", label: tf("white") },
    ],
  },
  {
    key: "type",
    opts: [
      { value: "any", label: tf("type") },
      { value: "photo", label: tf("photo") },
      { value: "clipart", label: tf("clipart") },
      { value: "lineart", label: tf("lineart") },
      { value: "animated", label: tf("animated") },
    ],
  },
  {
    key: "layout",
    opts: [
      { value: "any", label: tf("layout") },
      { value: "square", label: tf("square") },
      { value: "wide", label: tf("wide") },
      { value: "tall", label: tf("tall") },
    ],
  },
  {
    key: "nsfw",
    opts: [
      { value: "any", label: tf("nsfw") },
      { value: "on", label: tf("strict") },
      { value: "moderate", label: tf("moderate") },
      { value: "off", label: tf("off") },
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
