import { state } from "../state";
import { performSearch } from "./search-actions";

const TIME_LABELS: Record<string, string> = {
  any: "Any time",
  hour: "Hour",
  day: "24 hours",
  week: "Week",
  month: "Month",
  year: "Year",
  custom: "Custom",
};

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

export function initOptionsDropdown(): void {
  const toggle = document.getElementById("tools-toggle");
  const dropdown = document.getElementById("tools-dropdown");
  const toolsBar = document.getElementById("tools-bar");
  const submenuTime = document.getElementById("tools-submenu-time");
  const submenuLang = document.getElementById("tools-submenu-lang");
  if (!toggle || !dropdown || !toolsBar || !submenuTime || !submenuLang) return;

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

  document.body.appendChild(dropdown);
  document.body.appendChild(submenuTime);
  document.body.appendChild(submenuLang);

  let _activeSubmenu: HTMLElement | null = null;

  function updateToggle(): void {
    toggle!.classList.toggle("active", isActive());
  }

  function updateValueLabels(): void {
    if (timeValEl) {
      timeValEl.textContent =
        TIME_LABELS[state.currentTimeFilter] ?? "Any time";
      timeValEl.classList.toggle(
        "tools-menu-value--set",
        state.currentTimeFilter !== "any",
      );
    }
    if (langValEl) {
      langValEl.textContent = state.currentLanguage
        ? getLangName(state.currentLanguage)
        : "Any";
      langValEl.classList.toggle(
        "tools-menu-value--set",
        !!state.currentLanguage,
      );
    }
  }

  function positionDropdown(): void {
    const rect = toggle!.getBoundingClientRect();
    dropdown!.style.position = "fixed";
    dropdown!.style.top = `${rect.bottom + 4}px`;
    dropdown!.style.right = `${window.innerWidth - rect.right}px`;
  }

  function positionSubmenu(submenu: HTMLElement, itemEl: HTMLElement): void {
    const viewW = window.innerWidth;
    const anchorRect = itemEl.getBoundingClientRect();
    submenu.style.position = "fixed";

    if (viewW >= 768) {
      const dropdownRect = dropdown!.getBoundingClientRect();
      let left = dropdownRect.right + 4;
      if (left + 220 > viewW - 8) left = dropdownRect.left - 224;
      submenu.style.top = `${anchorRect.top}px`;
      submenu.style.left = `${left}px`;
      submenu.style.width = "";
    } else {
      const dropdownRect = dropdown!.getBoundingClientRect();
      submenu.style.top = `${anchorRect.bottom}px`;
      submenu.style.left = `${dropdownRect.left}px`;
      submenu.style.width = `${dropdownRect.width}px`;
    }
  }

  function closeSubmenu(): void {
    if (_activeSubmenu) {
      _activeSubmenu.style.display = "none";
      _activeSubmenu = null;
    }
  }

  function closeAll(): void {
    dropdown!.style.display = "none";
    closeSubmenu();
    updateToggle();
  }

  function openDropdown(): void {
    positionDropdown();
    dropdown!.style.display = "block";
    toggle!.classList.add("active");
  }

  function openSubmenu(submenu: HTMLElement, itemEl: HTMLElement): void {
    if (_activeSubmenu === submenu) {
      closeSubmenu();
      return;
    }
    closeSubmenu();
    positionSubmenu(submenu, itemEl);
    submenu.style.display = "block";
    _activeSubmenu = submenu;
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
      const res = await fetch("/api/settings/languages");
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
            `<button type="button" class="tools-option tools-lang-option${code === state.currentLanguage ? " active" : ""}" data-lang="${code}">${label}${code ? ` <span class="tools-lang-code">${code}</span>` : ""}</button>`,
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
        closeAll();
        if (state.currentQuery)
          void performSearch(state.currentQuery, state.currentType);
      });
    } catch {
      if (langList)
        langList.innerHTML =
          '<p class="tools-lang-error">Failed to load languages</p>';
    }
  }

  updateToggle();
  updateValueLabels();
  syncTimeOptions();
  void loadLanguages();

  toggle.addEventListener("click", () => {
    const open = dropdown.style.display !== "none";
    if (open) closeAll();
    else openDropdown();
  });

  document.addEventListener("click", (e) => {
    const target = e.target as Node;
    if (
      !toggle.contains(target) &&
      !dropdown.contains(target) &&
      !submenuTime.contains(target) &&
      !submenuLang.contains(target)
    ) {
      closeAll();
    }
  });

  window.addEventListener(
    "scroll",
    (e) => {
      if (dropdown.style.display !== "block") return;
      const target = e.target as Node;
      if (submenuTime.contains(target) || submenuLang.contains(target)) return;
      closeAll();
    },
    { capture: true },
  );

  dropdown.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(
      ".tools-menu-item",
    );
    if (!item) return;
    const menu = item.dataset.menu;
    if (menu === "time") openSubmenu(submenuTime, item);
    else if (menu === "lang") {
      openSubmenu(submenuLang, item);
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
    if (value !== "custom") {
      closeAll();
      if (state.currentQuery)
        void performSearch(state.currentQuery, state.currentType);
    }
  });

  dateApplyBtn?.addEventListener("click", () => {
    state.customDateFrom = dateFromInput?.value ?? "";
    state.customDateTo = dateToInput?.value ?? "";
    closeAll();
    if (state.currentQuery)
      void performSearch(state.currentQuery, state.currentType);
  });

  langFilter?.addEventListener("input", () =>
    syncLangOptions(langFilter.value),
  );
}
