import { clear, render } from "../../../shared/ui/tribute/dom";
import { FaviconCard } from "./card";
import { EmptyState } from "./empty-state";
import type { AllExtensions, ExtensionMeta } from "../../types/extension";
import { getBase } from "../../utils/net/base-url";
import { authHeaders, jsonHeaders } from "../../utils/net/request";
import { getStoredToken } from "../../utils/settings/settings-token";
import { initDragOrder } from "../../utils/dom/drag-order";
import { saveField } from "../../utils/settings/settings-api";
import { ShapePicker } from "./shape-picker";
import { DegoogFaviconCard, FAVICON_STORE_SETTING } from "./degoog-card";
import { flashError, flashSuccess } from "../shared/flash-msg";
import {
  DEFAULT_FAVICON_SHAPE,
  FAVICON_SHAPE_SETTING,
  isFaviconShape,
} from "../../../shared/favicon-shapes";

const t = window.scopedT("core");

const CARDS_CLASS = "ext-cards--orderable";

const UNRANKED_PRIORITY = -1;

const _priority = (provider: ExtensionMeta): number => {
  const v = provider.settings["priority"];
  const n = parseInt(typeof v === "string" ? v : "", 10);
  return isNaN(n) ? UNRANKED_PRIORITY : n;
};

const _savePriorities = async (list: HTMLElement): Promise<void> => {
  const cards = Array.from(list.querySelectorAll<HTMLElement>(".ext-card"));
  const total = cards.length;
  try {
    const responses = await Promise.all(
      cards.flatMap((card, i) => {
        const id = card.dataset.id;
        if (!id) return [];
        return [
          fetch(
            `${getBase()}/api/extensions/${encodeURIComponent(id)}/settings`,
            {
              method: "POST",
              headers: jsonHeaders(getStoredToken),
              body: JSON.stringify({ priority: String(total - 1 - i) }),
            },
          ),
        ];
      }),
    );
    if (responses.some((res) => !res.ok)) {
      flashError(t("settings-page.server.save-failed-network"));
    }
  } catch (err) {
    console.warn("[settings] favicon provider order save failed", err);
  }
  window.dispatchEvent(new CustomEvent("extensions-saved"));
};

const _currentShape = (): string => {
  const value = document.documentElement.dataset.faviconShape;
  return isFaviconShape(value) ? value : DEFAULT_FAVICON_SHAPE;
};

function _markActiveShape(container: HTMLElement, shape: string): void {
  container
    .querySelectorAll<HTMLButtonElement>("[data-favicon-shape-option]")
    .forEach((btn) => {
      const on = btn.dataset.faviconShapeOption === shape;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
}

const DEGOOG_SLOT_ID = "favicon-degoog-slot";

const _isOn = (value: unknown, fallback: boolean): boolean =>
  value === undefined || value === "" ? fallback : value === true || value === "true";

let _degoogCardRequest = 0;

async function _mountDegoogCard(container: HTMLElement): Promise<void> {
  const slot = container.querySelector<HTMLElement>(`#${DEGOOG_SLOT_ID}`);
  if (!slot) return;
  const request = ++_degoogCardRequest;
  let settings: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${getBase()}/api/settings/general`, {
      headers: authHeaders(getStoredToken),
    });
    if (res.ok) settings = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.warn("[settings] degoog favicon card failed to load", err);
  }
  if (request !== _degoogCardRequest || !settings) return;
  if (!_isOn(settings.degoogIndexerEnabled, false)) {
    clear(slot);
    slot.hidden = true;
    return;
  }
  if (!slot.hasChildNodes()) {
    render(
      <div class="ext-cards">
        <DegoogFaviconCard enabled={_isOn(settings[FAVICON_STORE_SETTING], true)} />
      </div>,
      slot,
    );
  }
  slot.hidden = false;
}

const _shapeWired = new WeakSet<HTMLElement>();

function _wireShapePicker(container: HTMLElement): void {
  if (_shapeWired.has(container)) return;
  _shapeWired.add(container);
  container.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-favicon-shape-option]");
    const next = btn?.dataset.faviconShapeOption;
    const previous = _currentShape();
    if (!isFaviconShape(next) || next === previous) return;
    document.documentElement.dataset.faviconShape = next;
    _markActiveShape(container, next);
    void saveField(FAVICON_SHAPE_SETTING, next, getStoredToken).then((ok) => {
      if (ok) {
        flashSuccess(t("settings-page.server.saved"));
        return;
      }
      document.documentElement.dataset.faviconShape = previous;
      _markActiveShape(container, previous);
      flashError(t("settings-page.server.save-failed-network"));
    });
  });
}

export function initFaviconTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("favicon-content");
  if (!container) return;

  const providers = [...(allExtensions.favicon ?? [])].sort(
    (a, b) => _priority(b) - _priority(a),
  );

  render(
    <>
      <ShapePicker active={_currentShape()} />
      <div id={DEGOOG_SLOT_ID} class="ext-group" hidden={true} static={true} />
      {providers.length > 0 ? (
        <div class="ext-group">
          <h3 class="ext-group-label">
            {t("settings-page.extensions.group-favicon")}
          </h3>
          <p class="degoog-text degoog-text--sm degoog-text--secondary">
            {t("settings-page.extensions.favicon-order-desc")}
          </p>
          <div class={`ext-cards ${CARDS_CLASS}`}>
            {providers.map((provider) => (
              <FaviconCard key={provider.id} provider={provider} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState />
      )}
    </>,
    container,
  );

  _wireShapePicker(container);
  void _mountDegoogCard(container);

  const cardsEl = container.querySelector<HTMLElement>(`.${CARDS_CLASS}`);
  if (!cardsEl) return;
  initDragOrder(cardsEl, {
    itemSelector: ".ext-card",
    handleSelector: "[data-drag-handle]",
    onReorder: (list) => void _savePriorities(list),
  });
}
