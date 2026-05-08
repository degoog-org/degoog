import { state } from "../state";
import { escapeHtml } from "./dom";
import { searchAuthHeaders } from "./request";
import { getBase } from "./base-url";

const _w = window as Window & { __DEGOOG_AC_DEBOUNCE__?: number };
const _acDebounce = (): number => _w.__DEGOOG_AC_DEBOUNCE__ ?? 300;

let acController: AbortController | null = null;
let acTimeout: ReturnType<typeof setTimeout> | null = null;
let acSelectedIdx = -1;

function _updateAcHighlight(items: NodeListOf<HTMLElement>): void {
  items.forEach((el, i) => {
    el.classList.toggle("ac-active", i === acSelectedIdx);
  });
}

export function hideAcDropdown(dropdown: HTMLElement | null): void {
  if (!dropdown) return;
  dropdown.style.display = "none";
  dropdown.parentElement?.classList.remove("ac-open");
  acSelectedIdx = -1;
}

async function _fetchSuggestions(
  query: string,
  input: HTMLInputElement,
  dropdown: HTMLElement,
  performSearch: (q: string) => void,
): Promise<void> {
  if (acController) acController.abort();
  acController = new AbortController();

  try {
    const res = state.postMethodEnabled
      ? await fetch(`${getBase()}/api/suggest`, {
          method: "POST",
          body: JSON.stringify({ query }),
          headers: {
            "Content-Type": "application/json",
            ...searchAuthHeaders(),
          },
          signal: acController.signal,
        })
      : await fetch(`${getBase()}/api/suggest?q=${encodeURIComponent(query)}`, {
          headers: searchAuthHeaders(),
          signal: acController.signal,
        });

    const raw = (await res.json()) as {
      text: string;
      source: string;
      rich?: { description?: string; thumbnail?: string; type?: string };
    }[];
    const suggestions = Array.isArray(raw) ? raw : [];

    if (!suggestions.length || input.value.trim() !== query) {
      dropdown.innerHTML = "";
      dropdown.style.display = "none";
      return;
    }

    acSelectedIdx = -1;
    dropdown.innerHTML = suggestions
      .map((s) => {
        if (s.rich && (s.rich.description || s.rich.thumbnail)) {
          const thumb = s.rich.thumbnail
            ? `<img class="degoog-ac-rich-thumb" src="${escapeHtml(s.rich.thumbnail)}" alt="" aria-hidden="true">`
            : "";
          const type = s.rich.type
            ? `<span class="degoog-ac-rich-type">${escapeHtml(s.rich.type)}</span>`
            : "";
          const desc = s.rich.description
            ? `<span class="degoog-ac-rich-desc">${escapeHtml(s.rich.description)}</span>`
            : "";
          return `<div class="ac-item degoog-ac-rich" data-text="${escapeHtml(s.text)}">${thumb}<div class="degoog-ac-rich-body"><div class="degoog-ac-rich-title">${escapeHtml(s.text)}${type}</div>${desc}</div><span class="degoog-ac-source">${escapeHtml(s.source)}</span></div>`;
        }
        return `<div class="ac-item" data-text="${escapeHtml(s.text)}"><span class="degoog-ac-text">${escapeHtml(s.text)}</span><span class="degoog-ac-source">${escapeHtml(s.source)}</span></div>`;
      })
      .join("");
    dropdown.style.display = "block";
    dropdown.parentElement?.classList.add("ac-open");

    dropdown.querySelectorAll<HTMLElement>(".ac-item").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const text =
          el.dataset.text ??
          el.querySelector(".degoog-ac-text, .degoog-ac-rich-title")
            ?.textContent ??
          "";
        input.value = text;
        hideAcDropdown(dropdown);
        performSearch(text);
      });
    });
  } catch {}
}

export function initAutocomplete(
  input: HTMLInputElement | null,
  dropdown: HTMLElement | null,
  performSearch: (q: string) => void,
): void {
  if (!input || !dropdown) return;

  input.addEventListener("input", () => {
    if (acTimeout) clearTimeout(acTimeout);
    const q = input.value.trim();
    if (!q || q.startsWith("!")) {
      dropdown.innerHTML = "";
      dropdown.style.display = "none";
      dropdown.parentElement?.classList.remove("ac-open");
      return;
    }
    acTimeout = setTimeout(
      () => void _fetchSuggestions(q, input, dropdown, performSearch),
      _acDebounce(),
    );
  });

  input.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll<HTMLElement>(".ac-item");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      acSelectedIdx = Math.min(acSelectedIdx + 1, items.length - 1);
      _updateAcHighlight(items);
      input.value =
        items[acSelectedIdx].dataset.text ??
        items[acSelectedIdx].querySelector(".degoog-ac-text")?.textContent ??
        "";
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      acSelectedIdx = Math.max(acSelectedIdx - 1, 0);
      _updateAcHighlight(items);
      input.value =
        items[acSelectedIdx].dataset.text ??
        items[acSelectedIdx].querySelector(".degoog-ac-text")?.textContent ??
        "";
    } else if (e.key === "Enter" || e.key === "Escape") {
      hideAcDropdown(dropdown);
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => hideAcDropdown(dropdown), 300);
  });

  input.addEventListener("focus", () => {
    if (dropdown.children.length > 0) {
      dropdown.style.display = "block";
      dropdown.parentElement?.classList.add("ac-open");
    }
  });
}
