import { escapeHtml } from "./dom";
import { performSearch } from "./search-actions";
import type { SearchBarAction } from "../types";
import { getBase } from "./base-url";

const SEARCH_BAR_ACTION_EVENT = "search-bar-action";

const _renderActionButton = (
  action: SearchBarAction,
  inputId: string,
): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "search-bar-action-btn";
  btn.dataset.actionId = action.id;
  btn.dataset.actionType = action.type;
  btn.dataset.inputId = inputId;
  if (action.type === "navigate" && action.url) btn.dataset.url = action.url;
  if (action.type === "bang" && action.trigger)
    btn.dataset.trigger = action.trigger;
  if (action.icon) {
    const img = document.createElement("img");
    img.src = escapeHtml(action.icon);
    img.alt = "";
    img.className = "search-bar-action-icon";
    btn.appendChild(img);
  }
  const label = document.createElement("span");
  label.className = "search-bar-action-label";
  label.textContent = action.label;
  btn.appendChild(label);
  return btn;
};

function _handleActionClick(e: MouseEvent): void {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(
    ".search-bar-action-btn",
  );
  if (!btn) return;
  const { actionId, actionType, inputId } = btn.dataset;
  const input = inputId
    ? (document.getElementById(inputId) as HTMLInputElement | null)
    : null;

  if (actionType === "navigate") {
    const url = btn.dataset.url;
    if (url) window.location.href = url;
    return;
  }
  if (actionType === "bang") {
    const trigger = btn.dataset.trigger;
    if (trigger && input) {
      input.value = `!${trigger} `;
      input.focus();
      const form = input.closest("form");
      if (form && inputId === "results-search-input") {
        void performSearch(input.value);
      } else if (form && inputId === "search-input") {
        form.submit();
      }
    }
    return;
  }
  if (actionType === "custom") {
    window.dispatchEvent(
      new CustomEvent(SEARCH_BAR_ACTION_EVENT, {
        detail: { actionId, inputId, input: input ?? null },
      }),
    );
  }
}

export function initSearchBarActions(): void {
  const containers = document.querySelectorAll<HTMLElement>(
    ".search-bar-actions",
  );
  if (!containers.length) return;
  const homeInputId = "search-input";
  const resultsInputId = "results-search-input";
  fetch(`${getBase()}/api/search-bar/actions`)
    .then((r) => r.json())
    .then((data: { actions?: SearchBarAction[] }) => {
      const actions = data.actions ?? [];
      containers.forEach((container) => {
        container.innerHTML = "";
        const inputId =
          container.id === "search-bar-actions-results"
            ? resultsInputId
            : homeInputId;
        actions.forEach((action) => {
          container.appendChild(_renderActionButton(action, inputId));
        });
      });
    })
    .catch(() => {});

  document.body.addEventListener("click", _handleActionClick);
}
