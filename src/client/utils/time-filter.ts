import { state } from "../state";
import { performSearch } from "./search-actions";
import { getBase } from "./base-url";
import { isImageSearchType } from "./engines";

const TIME_LABELS: Record<string, string> = {
  any: "Any time",
  hour: "Hour",
  day: "24 hours",
  week: "Week",
  month: "Month",
  year: "Year",
  custom: "Custom",
};

const TOOLS_OPEN_KEY = "degoog-tools-open";
const TOOLS_CLOSE_EVENT = "degoog-tools-close";

let _langDisplayNames: Intl.DisplayNames | null = null;

function getLangName(code: string): string {
  try {
    if (!_langDisplayNames) {
      _langDisplayNames = new Intl.DisplayNames(["en"], { type: "language" });
    }
    return _langDisplayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function isActive(): boolean {
  return state.currentTimeFilter !== "any" || !!state.currentLanguage;
}

function readOpenPref(): boolean {
  try {
    return localStorage.getItem(TOOLS_OPEN_KEY) === "true";
  } catch (err) {
    console.debug("[tools] open pref read failed", err);
    return false;
  }
}

function writeOpenPref(open: boolean): void {
  try {
    localStorage.setItem(TOOLS_OPEN_KEY, open ? "true" : "false");
  } catch (err) {
    console.debug("[tools] open pref write failed", err);
  }
}

export function initOptionsDropdown(): void {
  const toggle = document.getElementById("tools-toggle");
  const panel = document.getElementById("tools-panel");
  const toolsBar = document.getElementById("tools-bar");
  const submenuTime = document.getElementById("tools-submenu-time");
  const submenuLang = document.getElementById("tools-submenu-lang");
  if (!toggle || !panel || !toolsBar || !submenuTime || !submenuLang) return;

  const customDateWrap = document.getElementById("tools-custom-date");
  const dateFromInput = document.getElementById(
    "tools-date-from",
  ) as HTMLInputElement | null;
  const dateToInput = document.getElementById(
    "tools-date-to",
  ) as HTMLInputElement | null;
  const dateApplyBtn = document.getElementById("tools-date-apply");
  const langFilter = document.getElementById(
    "tools-lang-filter",
  ) as HTMLInputElement | null;
  const langList = document.getElementById("tools-lang-list");
  const timeValEl = document.getElementById("tools-time-val");
  const langValEl = document.getElementById("tools-lang-val");

  const tabsRow = document.getElementById("results-tabs");
  if (tabsRow && panel.parentElement !== tabsRow.parentElement) {
    tabsRow.after(panel);
  }

  let activeField: HTMLElement | null = null;

  function updateToggle(): void {
    toggle!.classList.toggle("active", isActive());
  }

  function updateValueLabels(): void {
    if (timeValEl) {
      timeValEl.textContent =
        TIME_LABELS[state.currentTimeFilter] ?? "Any time";
      timeValEl.classList.toggle(
        "tools-field-value--set",
        state.currentTimeFilter !== "any",
      );
    }
    if (langValEl) {
      langValEl.textContent = state.currentLanguage
        ? getLangName(state.currentLanguage)
        : "Any";
      langValEl.classList.toggle(
        "tools-field-value--set",
        !!state.currentLanguage,
      );
    }
  }

  function closeField(): void {
    if (activeField) {
      activeField.style.display = "none";
      panel!
        .querySelector<HTMLElement>(
          `.tools-field-toggle[aria-controls="${activeField.id}"]`,
        )
        ?.setAttribute("aria-expanded", "false");
      activeField = null;
    }
  }

  function openField(menu: HTMLElement): void {
    if (activeField === menu) {
      closeField();
      return;
    }
    closeField();
    menu.style.display = "block";
    panel!
      .querySelector<HTMLElement>(
        `.tools-field-toggle[aria-controls="${menu.id}"]`,
      )
      ?.setAttribute("aria-expanded", "true");
    activeField = menu;
  }

  function setPanelOpen(open: boolean): void {
    panel!.style.display = open ? "flex" : "none";
    toggle!.classList.toggle("is-open", open);
    toggle!.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) closeField();
    writeOpenPref(open);
  }

  function syncTimeOptions(): void {
    submenuTime!
      .querySelectorAll<HTMLElement>(".tools-option[data-time]")
      .forEach((o) => {
        o.classList.toggle(
          "active",
          o.dataset.time === state.currentTimeFilter,
        );
      });
    if (customDateWrap) {
      customDateWrap.style.display =
        state.currentTimeFilter === "custom" ? "flex" : "none";
    }
    updateValueLabels();
  }

  function syncLangOptions(filter = ""): void {
    if (!langList) return;
    const q = filter.toLowerCase();
    langList
      .querySelectorAll<HTMLElement>(".tools-lang-option")
      .forEach((el) => {
        const code = el.dataset.lang ?? "";
        const label = el.textContent ?? "";
        const match = !q || code.includes(q) || label.toLowerCase().includes(q);
        el.style.display = match ? "" : "none";
        el.classList.toggle("active", code === state.currentLanguage);
      });
    updateValueLabels();
  }

  async function loadLanguages(): Promise<void> {
    if (!langList) return;
    try {
      const res = await fetch(`${getBase()}/api/settings/languages`);
      const data = (await res.json()) as { languages: string[] };
      const codes = data.languages ?? [];

      const items = [
        { code: "", label: "Any language" },
        ...codes.map((c) => ({ code: c, label: getLangName(c) })),
      ];
      items.sort((a, b) => {
        if (!a.code) return -1;
        if (!b.code) return 1;
        return a.label.localeCompare(b.label);
      });

      langList.innerHTML = items
        .map(
          ({ code, label }) =>
            `<button type="button" class="tools-option tools-lang-option degoog-menu-item${code === state.currentLanguage ? " active" : ""}" data-lang="${code}">${label}${code ? ` <span class="tools-lang-code">${code}</span>` : ""}</button>`,
        )
        .join("");

      langList.addEventListener("click", (e) => {
        const opt = (e.target as HTMLElement).closest<HTMLElement>(
          ".tools-lang-option",
        );
        if (!opt) return;
        const lang = opt.dataset.lang ?? "";
        if (lang === state.currentLanguage) return;
        state.currentLanguage = lang;
        syncLangOptions(langFilter?.value ?? "");
        closeField();
        updateToggle();
        if (state.currentQuery)
          void performSearch(state.currentQuery, state.currentType);
      });
    } catch {
      if (langList)
        langList.innerHTML =
          '<p class="tools-lang-error">Failed to load languages</p>';
    }
  }

  setPanelOpen(readOpenPref());
  updateToggle();
  updateValueLabels();
  syncTimeOptions();
  void loadLanguages();

  toggle.addEventListener("click", () => {
    const open = panel.style.display === "none";
    setPanelOpen(open);
    if (isImageSearchType(state.currentType)) {
      void import("../modules/filters/image-filters").then(
        ({ toggleImgSidebar }) => toggleImgSidebar(open),
      );
    }
  });

  window.addEventListener(TOOLS_CLOSE_EVENT, () => {
    setPanelOpen(false);
    if (isImageSearchType(state.currentType)) {
      void import("../modules/filters/image-filters").then(
        ({ toggleImgSidebar }) => toggleImgSidebar(false),
      );
    }
  });

  document.addEventListener("click", (e) => {
    const target = e.target as Node;
    if (!panel.contains(target) && !toggle.contains(target)) {
      closeField();
    }
  });

  panel.addEventListener("click", (e) => {
    const fieldToggle = (e.target as HTMLElement).closest<HTMLElement>(
      ".tools-field-toggle",
    );
    if (!fieldToggle) return;
    const menu = fieldToggle.dataset.menu;
    if (menu === "time") openField(submenuTime);
    else if (menu === "lang") {
      openField(submenuLang);
      if (langFilter) setTimeout(() => langFilter.focus(), 50);
    }
  });

  submenuTime.addEventListener("click", (e) => {
    const opt = (e.target as HTMLElement).closest<HTMLElement>(
      ".tools-option[data-time]",
    );
    if (!opt) return;
    const value = opt.dataset.time;
    if (!value || value === state.currentTimeFilter) return;
    state.currentTimeFilter = value;
    syncTimeOptions();
    updateToggle();
    if (value !== "custom") {
      closeField();
      if (state.currentQuery)
        void performSearch(state.currentQuery, state.currentType);
    }
  });

  dateApplyBtn?.addEventListener("click", () => {
    state.customDateFrom = dateFromInput?.value ?? "";
    state.customDateTo = dateToInput?.value ?? "";
    closeField();
    if (state.currentQuery)
      void performSearch(state.currentQuery, state.currentType);
  });

  langFilter?.addEventListener("input", () =>
    syncLangOptions(langFilter.value),
  );
}
