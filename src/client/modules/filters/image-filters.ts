import { state } from "../../state";
import type { EngineTiming } from "../../types";
import { escapeHtml, escapeAttribute } from "../../utils/dom";
import { getRegistry, getEngines, isImageSearchType } from "../../utils/engines";
import { engineStatsHtml, setupRetryLinks } from "../renderer/render-sidebar";

const FILTER_BAR_ID = "image-filters-bar";
const ENGINE_PANEL_ID = "image-engine-panel";
const GROUPS_ID = "image-filter-groups";
const OVERLAY_CLASS = "degoog-img-sidebar-overlay";
const TOGGLE_CLASS = "degoog-img-filter-toggle";
const T_NS = "themes/degoog";
const T_PFX = "search-templates.image-filters";

const t = window.scopedT(T_NS);
const tf = (key: string): string => t(`${T_PFX}.${key}`);

const GROUP_ORDER = ["size", "color", "type", "layout", "nsfw"];
const VALUE_LABEL_KEY: Record<string, string> = {
  monochrome: "bw",
  on: "strict",
};

const CHEVRON_SVG =
  '<svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';

const labelFor = (value: string): string =>
  tf(VALUE_LABEL_KEY[value] ?? value);

const filters = (): Record<string, string> =>
  state.imageFilter as Record<string, string>;

const buildUnion = async (): Promise<Record<string, string[]>> => {
  const [reg, enabled] = await Promise.all([getRegistry(), getEngines()]);
  const union: Record<string, string[]> = {};
  for (const engine of reg.engines) {
    if (!enabled[engine.id]) continue;
    if (!(engine.searchTypes ?? []).includes("images")) continue;
    if (!engine.filters) continue;
    for (const [group, values] of Object.entries(engine.filters)) {
      const bucket = union[group] ?? (union[group] = []);
      for (const value of values) {
        if (!bucket.includes(value)) bucket.push(value);
      }
    }
  }
  return union;
};

const orderedGroups = (union: Record<string, string[]>): string[] => [
  ...GROUP_ORDER.filter((g) => union[g]),
  ...Object.keys(union).filter((g) => !GROUP_ORDER.includes(g)),
];

const activeValue = (group: string, values: string[]): string => {
  const current = filters()[group];
  return current && values.includes(current) ? current : "";
};

const optionHtml = (group: string, value: string, active: string): string => {
  const isActive = value === active;
  const label = value === "" ? tf("any") : labelFor(value);
  return `<button type="button" class="degoog-img-filter-option${isActive ? " is-active" : ""}" role="radio" aria-checked="${isActive ? "true" : "false"}" data-group="${escapeAttribute(group)}" data-value="${escapeAttribute(value)}">
      <span class="degoog-img-filter-text">${escapeHtml(label)}</span>
    </button>`;
};

const groupHtml = (
  group: string,
  values: string[],
  active: string,
): string => {
  const title = tf(group);
  const suffix = active
    ? `<span class="degoog-img-filter-current">${escapeHtml(labelFor(active))}</span>`
    : "";
  const options = [
    optionHtml(group, "", active),
    ...values.map((value) => optionHtml(group, value, active)),
  ].join("");
  return `<div class="degoog-accordion degoog-img-filter-group degoog-panel degoog-panel--accordion degoog-panel--stack-item">
      <button class="degoog-accordion-toggle" type="button">
        <span class="degoog-img-filter-head">${escapeHtml(title)}${suffix}</span>
        ${CHEVRON_SVG}
      </button>
      <div class="degoog-accordion-body degoog-img-filter-options" role="radiogroup" aria-label="${escapeAttribute(title)}">${options}</div>
    </div>`;
};

const shellHtml = (): string =>
  `<div class="degoog-img-sidebar">
    <div class="degoog-img-sidebar-head">
      <span class="degoog-img-sidebar-title">${escapeHtml(tf("title"))}</span>
      <button type="button" class="degoog-img-sidebar-close" aria-label="${escapeAttribute(tf("close"))}">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="degoog-img-sidebar-body">
      <div id="${ENGINE_PANEL_ID}"></div>
      <div id="${GROUPS_ID}"></div>
    </div>
  </div>`;

const setOpen = (open: boolean): void => {
  document.getElementById(FILTER_BAR_ID)?.classList.toggle("open", open);
  document
    .querySelector(`.${OVERLAY_CLASS}`)
    ?.classList.toggle("open", open);
};

const ensureOverlay = (): void => {
  if (document.querySelector(`.${OVERLAY_CLASS}`)) return;
  const overlay = document.createElement("div");
  overlay.className = OVERLAY_CLASS;
  overlay.addEventListener("click", () => setOpen(false));
  document.body.appendChild(overlay);
};

const ensureShell = (): HTMLElement | null => {
  const bar = document.getElementById(FILTER_BAR_ID);
  if (!bar) return null;
  if (!document.getElementById(GROUPS_ID)) {
    bar.innerHTML = shellHtml();
  }
  ensureOverlay();
  return bar;
};

const wireAccordions = (bar: HTMLElement): void => {
  bar
    .querySelectorAll<HTMLElement>(".degoog-accordion-toggle")
    .forEach((btn) => {
      if (btn.dataset.imgToggleWired === "true") return;
      btn.dataset.imgToggleWired = "true";
      btn.addEventListener("click", () => {
        btn
          .closest(".degoog-accordion, .sidebar-accordion")
          ?.classList.toggle("open");
      });
    });

  const close = bar.querySelector<HTMLElement>(".degoog-img-sidebar-close");
  if (close && close.dataset.imgCloseWired !== "true") {
    close.dataset.imgCloseWired = "true";
    close.addEventListener("click", () => setOpen(false));
  }
};

const buildGroups = async (): Promise<void> => {
  const bar = ensureShell();
  if (!bar) return;
  const groupsEl = document.getElementById(GROUPS_ID);
  if (!groupsEl) return;

  const union = await buildUnion();
  const groups = orderedGroups(union);
  groupsEl.innerHTML = groups
    .map((group) =>
      groupHtml(group, union[group], activeValue(group, union[group])),
    )
    .join("");

  wireAccordions(bar);
};

type SearchFn = (query: string, type: string) => void;

let onSearchFn: SearchFn | null = null;

const selectOption = (option: HTMLElement): void => {
  const group = option.dataset.group;
  if (!group) return;
  const value = option.dataset.value ?? "";

  filters()[group] = value;

  const radiogroup = option.closest(".degoog-img-filter-options");
  radiogroup
    ?.querySelectorAll<HTMLElement>(".degoog-img-filter-option")
    .forEach((opt) => {
      const active = opt === option;
      opt.classList.toggle("is-active", active);
      opt.setAttribute("aria-checked", active ? "true" : "false");
    });

  const head = option
    .closest(".degoog-img-filter-group")
    ?.querySelector(".degoog-img-filter-head");
  if (head) {
    head.querySelector(".degoog-img-filter-current")?.remove();
    if (value) {
      const badge = document.createElement("span");
      badge.className = "degoog-img-filter-current";
      badge.textContent = labelFor(value);
      head.appendChild(badge);
    }
  }

  if (state.currentQuery && onSearchFn) {
    onSearchFn(state.currentQuery, state.currentType);
  }
};

export const renderImgEngines = (timings: EngineTiming[]): void => {
  const bar = ensureShell();
  const panel = document.getElementById(ENGINE_PANEL_ID);
  if (panel) {
    panel.innerHTML = engineStatsHtml(timings);
  }
  if (bar) {
    setupRetryLinks(bar);
    wireAccordions(bar);
  }
  ensureToggleButton();
};

const ensureToggleButton = (): void => {
  const meta = document.getElementById("results-meta");
  if (!meta || meta.querySelector(`.${TOGGLE_CLASS}`)) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${TOGGLE_CLASS} degoog-btn degoog-btn--secondary`;
  btn.setAttribute("aria-label", tf("toggle"));
  btn.innerHTML = '<i class="fa-solid fa-sliders fa-xl"></i>';
  btn.addEventListener("click", () => setOpen(true));
  meta.appendChild(btn);
};

export const initImgFilters = (onSearch: SearchFn): void => {
  const bar = ensureShell();
  if (!bar) return;
  onSearchFn = onSearch;

  const groupsEl = document.getElementById(GROUPS_ID);
  groupsEl?.addEventListener("click", (e) => {
    const option = (e.target as HTMLElement).closest<HTMLElement>(
      ".degoog-img-filter-option",
    );
    if (option) selectOption(option);
  });

  window.addEventListener("extensions-saved", () => void buildGroups());
  void buildGroups();
};

export const syncImgFilters = (type: string): void => {
  const bar = document.getElementById(FILTER_BAR_ID);
  if (!bar) return;
  const isImage = isImageSearchType(type);
  bar.style.display = isImage ? "block" : "none";
  if (!isImage) setOpen(false);
};
