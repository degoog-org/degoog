import { render } from "../../../shared/ui/tribute/dom";
import { PluginCard } from "./plugin-card";
import type { ExtensionMeta, AllExtensions } from "../../types";
import { getBase } from "../../utils/base-url";
import { initDragOrder } from "../../utils/drag-order";

const _priority = (plugin: ExtensionMeta): number => {
  const v = plugin.settings["priority"];
  const n = parseInt(typeof v === "string" ? v : "0", 10);
  return isNaN(n) ? 0 : n;
};

const _savePriorities = async (group: HTMLElement): Promise<void> => {
  const cards = group.querySelectorAll<HTMLElement>(".ext-card");
  const total = cards.length;
  await Promise.all(
    Array.from(cards).map((card, i) => {
      const id = card.dataset.id;
      if (!id) return Promise.resolve();
      return fetch(
        `${getBase()}/api/extensions/${encodeURIComponent(id)}/settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: String(total - 1 - i) }),
        },
      );
    }),
  );
  window.dispatchEvent(new CustomEvent("extensions-saved"));
};

const _matches = (plugin: ExtensionMeta, query: string): boolean =>
  plugin.displayName.toLowerCase().includes(query) ||
  (plugin.description ?? "").toLowerCase().includes(query);

const _renderCards = (
  cardsEl: HTMLElement,
  all: ExtensionMeta[],
  query: string,
): void => {
  const visible = query ? all.filter((plugin) => _matches(plugin, query)) : all;
  render(
    <>
      {visible.map((plugin) => (
        <PluginCard key={plugin.id} plugin={plugin} orderable={true} />
      ))}
    </>,
    cardsEl,
  );
};

export function initPluginsTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("plugins-content");
  if (!container) return;

  const all = [...allExtensions.plugins].sort(
    (a, b) => _priority(b) - _priority(a),
  );

  render(
    <>
      <div class="store-filter-bar">
        <input
          type="text"
          class="degoog-search-bar degoog-search-bar--square-advanced plugins-search-input"
          placeholder="Search plugins…"
          value=""
          onInput={(event) => {
            const cardsHost = container.querySelector<HTMLElement>(
              ".ext-cards--orderable",
            );
            if (!cardsHost) return;
            const value = (event.target as HTMLInputElement).value
              .trim()
              .toLowerCase();
            _renderCards(cardsHost, all, value);
          }}
        />
      </div>
      <div class="ext-group">
        <div class="ext-cards ext-cards--orderable"></div>
      </div>
    </>,
    container,
  );

  const cardsEl = container.querySelector<HTMLElement>(".ext-cards--orderable");
  if (!cardsEl) return;

  initDragOrder(cardsEl, {
    itemSelector: ".ext-card",
    handleSelector: "[data-drag-handle]",
    onReorder: (list) => void _savePriorities(list),
  });

  _renderCards(cardsEl, all, "");
}
