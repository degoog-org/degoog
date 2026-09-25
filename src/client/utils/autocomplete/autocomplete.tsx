import { clear, render } from "../../../shared/ui/tribute/dom";
import { AutocompleteItem } from "./autocomplete-item";
import { state } from "../../state";
import { searchAuthHeaders } from "../net/request";
import { getBase } from "../net/base-url";

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

export const abortAcReq = (): void => {
  if (acTimeout) {
    clearTimeout(acTimeout);
    acTimeout = null;
  }
  if (acController) {
    acController.abort();
    acController = null;
  }
};

export function hideAcDropdown(dropdown: HTMLElement | null): void {
  if (!dropdown) return;
  clear(dropdown);
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
      clear(dropdown);
      dropdown.style.display = "none";
      return;
    }

    acSelectedIdx = -1;
    render(
      <>
        {suggestions.map((suggestion, index) => (
          <AutocompleteItem
            key={`${index}:${suggestion.text}`}
            suggestion={suggestion}
            onPick={(text) => {
              input.value = text;
              hideAcDropdown(dropdown);
              performSearch(text);
            }}
          />
        ))}
      </>,
      dropdown,
    );
    dropdown.style.display = "block";
    dropdown.parentElement?.classList.add("ac-open");
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    console.debug("[autocomplete] suggest request failed", err);
  }
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
      clear(dropdown);
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
