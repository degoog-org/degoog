import { state } from "../../state";
import type { EngineTiming } from "../../types";
import { append, clear, render } from "../../../shared/ui/tribute/dom";
import { ImgFilterGroup } from "./img-filter-group";
import { ImgFilterSuffix } from "./img-filter-suffix";
import { ImgSidebarShell } from "./img-sidebar-shell";
import {
  ENGINE_PANEL_ID,
  FILTER_BAR_ID,
  GROUPS_ID,
  LAYOUT_ID,
  OVERLAY_CLASS,
  RESULTS_TABS_ID,
  TOOLS_CLOSE_EVENT,
  TOOLS_PANEL_ID,
  TOOLS_PIN_EVENT,
  TOOLS_TOGGLE_ID,
} from "./ids";
import {
  getRegistry,
  getEngines,
  isImageSearchType,
} from "../../utils/engines";
import { setupRetryLinks } from "../renderer/render-sidebar";
import { EngineStatsPanel } from "../renderer/engine-stats-panel";
import { paintOrigins } from "../../utils/search/engine-origins";

const PIN_MIN_WIDTH = 768;
const T_NS = "themes/degoog";
const T_PFX = "search-templates.image-filters";

const t = window.scopedT(T_NS);
const tf = (key: string): string => t(`${T_PFX}.${key}`);

const GROUP_ORDER = ["size", "color", "type", "layout", "nsfw"];
const VALUE_LABEL_KEY: Record<string, string> = {
  monochrome: "bw",
  on: "strict",
};

const labelFor = (value: string): string => tf(VALUE_LABEL_KEY[value] ?? value);

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
      if (!GROUP_ORDER.includes(group)) continue;
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

const pruneStaleFilters = (union: Record<string, string[]>): void => {
  const current = filters();
  for (const group of Object.keys(current)) {
    const value = current[group];
    if (value && !(union[group] ?? []).includes(value)) {
      current[group] = "";
    }
  }
};

const activeValue = (group: string, values: string[]): string => {
  const current = filters()[group];
  return current && values.includes(current) ? current : "";
};

const shellNode = (): JSX.Element => (
  <ImgSidebarShell title={tf("title")} closeLabel={tf("close")} />
);

const setOpen = (open: boolean): void => {
  document.getElementById(FILTER_BAR_ID)?.classList.toggle("open", open);
  document.getElementById(LAYOUT_ID)?.classList.toggle("filters-open", open);
  document.querySelector(`.${OVERLAY_CLASS}`)?.classList.toggle("open", open);
};

const toolsOpen = (): boolean =>
  document.getElementById(TOOLS_TOGGLE_ID)?.getAttribute("aria-expanded") ===
  "true";

const canPin = (): boolean => window.innerWidth >= PIN_MIN_WIDTH;

let pinnedNow = false;

const pinTools = (pinned: boolean): void => {
  pinnedNow = pinned;
  window.dispatchEvent(new CustomEvent(TOOLS_PIN_EVENT, { detail: pinned }));
};

export const toggleImgSidebar = (open: boolean): void => setOpen(open);

const requestToolsClose = (): void => {
  window.dispatchEvent(new CustomEvent(TOOLS_CLOSE_EVENT));
  setOpen(false);
};

const ensureOverlay = (): void => {
  if (document.querySelector(`.${OVERLAY_CLASS}`)) return;
  const overlay = document.createElement("div");
  overlay.className = OVERLAY_CLASS;
  overlay.addEventListener("click", requestToolsClose);
  document.body.appendChild(overlay);
};

const ensureShell = (): HTMLElement | null => {
  const bar = document.getElementById(FILTER_BAR_ID);
  if (!bar) return null;
  if (!document.getElementById(GROUPS_ID)) {
    render(shellNode(), bar);
  }
  ensureOverlay();
  return bar;
};

const wireAccordions = (bar: HTMLElement): void => {
  bar
    .querySelectorAll<HTMLElement>(".degoog-accordion-toggle")
    .forEach((btn) => {
      const group = btn.closest(".degoog-accordion, .sidebar-accordion");
      btn.setAttribute(
        "aria-expanded",
        group?.classList.contains("open") ? "true" : "false",
      );
      if (btn.dataset.imgToggleWired === "true") return;
      btn.dataset.imgToggleWired = "true";
      btn.addEventListener("click", () => {
        const open = group?.classList.toggle("open") ?? false;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });

  const close = bar.querySelector<HTMLElement>(".degoog-img-sidebar-close");
  if (close && close.dataset.imgCloseWired !== "true") {
    close.dataset.imgCloseWired = "true";
    close.addEventListener("click", requestToolsClose);
  }
};

const buildGroups = async (): Promise<void> => {
  const bar = ensureShell();
  if (!bar) return;
  const groupsEl = document.getElementById(GROUPS_ID);
  if (!groupsEl) return;

  const union = await buildUnion();
  pruneStaleFilters(union);
  const groups = orderedGroups(union);
  render(
    <>
      {groups.map((group) => (
        <ImgFilterGroup
          key={group}
          group={group}
          title={tf(group)}
          values={union[group]}
          active={activeValue(group, union[group])}
          labelFor={labelFor}
          defaultLabel={tf("default")}
        />
      ))}
    </>,
    groupsEl,
  );

  wireAccordions(bar);
};

type SearchFn = (query: string, type: string) => void;

let onSearchFn: SearchFn | null = null;

const selectOption = (option: HTMLElement): void => {
  const group = option.dataset.group;
  if (!group) return;
  const clicked = option.dataset.value ?? "";
  const current = filters()[group] ?? "";
  const value = clicked === current ? "" : clicked;
  if (value === current) return;

  filters()[group] = value;

  const radiogroup = option.closest(".degoog-img-filter-options");
  radiogroup
    ?.querySelectorAll<HTMLElement>(".degoog-img-filter-option")
    .forEach((opt) => {
      const active = (opt.dataset.value ?? "") === value;
      opt.classList.toggle("is-active", active);
      opt.setAttribute("aria-checked", active ? "true" : "false");
    });

  const head = option
    .closest(".degoog-img-filter-group")
    ?.querySelector<HTMLElement>(".degoog-img-filter-head");
  if (head) {
    head
      .querySelectorAll(".degoog-img-filter-sep, .degoog-img-filter-current")
      .forEach((el) => el.remove());
    if (value) {
      append(<ImgFilterSuffix label={labelFor(value)} />, head);
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
    const stats = EngineStatsPanel({ timings });
    if (stats) render(stats, panel);
    else clear(panel);
    void paintOrigins(panel);
  }
  if (bar) {
    setupRetryLinks(bar);
    wireAccordions(bar);
  }
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

const relocateToolsPanel = (): void => {
  const panel = document.getElementById(TOOLS_PANEL_ID);
  const groupsEl = document.getElementById(GROUPS_ID);
  if (!panel || !groupsEl || panel.parentElement === groupsEl.parentElement) {
    return;
  }
  groupsEl.before(panel);
};

const restoreToolsPanel = (): void => {
  const panel = document.getElementById(TOOLS_PANEL_ID);
  const tabsRow = document.getElementById(RESULTS_TABS_ID);
  if (!panel || !tabsRow || panel.previousElementSibling === tabsRow) return;
  tabsRow.after(panel);
};

let _filterBar: HTMLElement | null = null;

const _filterBarEl = (): HTMLElement | null => {
  if (!_filterBar) _filterBar = document.getElementById(FILTER_BAR_ID);
  return _filterBar;
};

export const syncImgFilters = (type: string): void => {
  const bar = _filterBarEl();
  if (!bar) return;
  const isImage = isImageSearchType(type);

  if (isImage) {
    if (!bar.isConnected) {
      const layout = document.getElementById(LAYOUT_ID);
      layout?.appendChild(bar);
    }
    bar.style.display = "block";
    ensureShell();
    relocateToolsPanel();
    pinTools(canPin());
    setOpen(pinnedNow || toolsOpen());
    return;
  }

  if (bar.isConnected) {
    pinTools(false);
    setOpen(false);
    restoreToolsPanel();
    bar.remove();
  }
};

const onViewportChange = (): void => {
  if (!isImageSearchType(state.currentType)) return;
  if (canPin() === pinnedNow) return;
  syncImgFilters(state.currentType);
};

window.addEventListener("resize", onViewportChange);
