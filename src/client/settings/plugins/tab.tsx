import { render } from "../../../shared/ui/tribute/dom";
import { PluginCard } from "./plugin-card";
import type { AllExtensions, ExtensionMeta } from "../../types/extension";
import { getBase } from "../../utils/net/base-url";
import { jsonHeaders } from "../../utils/net/request";
import { getStoredToken } from "../../utils/settings/settings-token";
import { initDragOrder } from "../../utils/dom/drag-order";
import { subtypeLabel } from "../store/render/labels";
import { ExtFilterBar, extFilterIds } from "../shared/filter/ext-filter-bar";
import { ExtNoMatch } from "../shared/filter/ext-no-match";
import {
  createExtFilter,
  createExtFilterActions,
  filterExtGroups,
  isFiltered,
  settingsIsOn,
} from "../shared/filter/ext-filter";
import { revealActiveTab } from "../shared/filter/filter-tabs";
import type { ExtFilterGroup } from "../../types/ext-filter";

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
          headers: jsonHeaders(getStoredToken),
          body: JSON.stringify({ priority: String(total - 1 - i) }),
        },
      );
    }),
  );
  window.dispatchEvent(new CustomEvent("extensions-saved"));
};

const _kind = (plugin: ExtensionMeta): string =>
  plugin.id.slice(plugin.id.lastIndexOf("-") + 1);

const _groups = (all: ExtensionMeta[]): ExtFilterGroup[] => {
  const kinds = [...new Set(all.map(_kind))];
  return kinds.map((kind) => ({
    key: kind,
    label: subtypeLabel("plugin", kind),
    items: all.filter((plugin) => _kind(plugin) === kind),
  }));
};

const _sortByDom = (cards: HTMLElement, all: ExtensionMeta[]): void => {
  const order = Array.from(cards.querySelectorAll<HTMLElement>(".ext-card")).map(
    (card) => card.dataset.id,
  );
  all.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
};

export function initPluginsTab(allExtensions: AllExtensions): void {
  const host = document.getElementById("plugins-content");
  if (!host) return;
  const container: HTMLElement = host;

  const all = [...allExtensions.plugins].sort(
    (a, b) => _priority(b) - _priority(a),
  );
  const filter = createExtFilter();
  const ids = extFilterIds("plugins");
  const actions = createExtFilterActions(filter, () => paint(), ids);

  const setEnabled = (plugin: ExtensionMeta, on: boolean): void => {
    plugin.settings = { ...plugin.settings, disabled: on ? "" : "true" };
    paint();
  };

  function paint(): void {
    const groups = _groups(all);
    const shown = new Set(
      filterExtGroups(groups, filter, settingsIsOn).flatMap((g) => g.items),
    );
    const visible = all.filter((plugin) => shown.has(plugin));
    const orderable = !isFiltered(filter) && filter.type === "all";
    render(
      <>
        <ExtFilterBar
          noun="plugins"
          ids={ids}
          groups={groups}
          shown={visible.length}
          filter={filter}
          isOn={settingsIsOn}
          actions={actions}
        />
        {visible.length ? null : <ExtNoMatch filter={filter} onClear={actions.clear} />}
        <div class="ext-group">
          <div class="ext-cards ext-cards--orderable">
            {visible.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                orderable={orderable}
                onSaved={(on) => setEnabled(plugin, on)}
              />
            ))}
          </div>
        </div>
      </>,
      container,
    );
    revealActiveTab(ids.tabs);
  }

  paint();

  const cardsEl = container.querySelector<HTMLElement>(".ext-cards--orderable");
  if (!cardsEl) return;

  initDragOrder(cardsEl, {
    itemSelector: ".ext-card",
    handleSelector: "[data-drag-handle]",
    onReorder: (list) => {
      _sortByDom(list, all);
      void _savePriorities(list);
    },
  });
}
