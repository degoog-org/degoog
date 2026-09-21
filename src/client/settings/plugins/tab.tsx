import { mount, render } from "../../../shared/ui/core/dom";
import { signal } from "../../../shared/ui/state/signal";
import { raw } from "../../../shared/ui/core/raw";
import { Badge } from "../../../shared/ui/components/primitives/badge";
import { Icon } from "../../../shared/ui/components/primitives/icon";
import { DragHandle } from "../../../shared/ui/components/extensions/drag-handle";
import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardDesc } from "../../../shared/ui/components/extensions/ext-card-desc";
import { ExtCardName } from "../../../shared/ui/components/extensions/ext-card-name";
import { ExtToggle } from "../../../shared/ui/components/extensions/ext-toggle";
import {
  extCardBadgeNode,
  extCardConfigureNode,
  extCardRestartWarningNode,
  extCardVersionWarningNode,
} from "../shared/ext-card";
import { extToggleHandler } from "../shared/ext-toggle";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { ExtensionMeta, AllExtensions } from "../../types";
import { getBase } from "../../utils/base-url";
import { renderMdInline } from "../../utils/md";
import { initDragOrder } from "../../utils/drag-order";

const t = window.scopedT("core");

const _query = signal("");
let _disposeCards: (() => void) | null = null;

const _priority = (plugin: ExtensionMeta): number => {
  const v = plugin.settings["priority"];
  const n = parseInt(typeof v === "string" ? v : "0", 10);
  return isNaN(n) ? 0 : n;
};

const EXPOSURE = {
  exposed: {
    modifier: "proxy-exposed",
    key: "exposure-exposed",
    icon: "fa-solid fa-triangle-exclamation",
  },
  safe: {
    modifier: "proxy-safe",
    key: "exposure-safe",
    icon: "fa-solid fa-circle-check",
  },
  unknown: {
    modifier: "proxy-unknown",
    key: "exposure-unknown",
    icon: "fa-solid fa-circle-info",
  },
} as const;

const ExposureBadge = ({ plugin }: { plugin: ExtensionMeta }): JSX.Element => {
  const state =
    plugin.isClientExposed === true
      ? EXPOSURE.exposed
      : plugin.isClientExposed === false
        ? EXPOSURE.safe
        : EXPOSURE.unknown;
  return (
    <Badge modifier={state.modifier} tooltip={t(`settings-page.extensions.${state.key}`)}>
      <Icon name={state.icon} />
    </Badge>
  );
};

const _canDisable = (plugin: ExtensionMeta): boolean =>
  plugin.configurable ||
  plugin.id.endsWith("-slot") ||
  (plugin.id.endsWith("-command") && plugin.source !== "builtin");

const PluginCard = ({
  plugin,
  orderable,
}: {
  plugin: ExtensionMeta;
  orderable: boolean;
}): JSX.Element => {
  const isEnabled = plugin.settings["disabled"] !== "true";
  const toggleId = `plugin-toggle-${plugin.id}`;

  return (
    <ExtCard
      id={plugin.id}
      nameRow={[
        <ExposureBadge plugin={plugin} />,
        extCardRestartWarningNode(plugin),
        <ExtCardName htmlFor={toggleId} class="plugin-toggle-label" name={plugin.displayName} />,
        plugin.source === "builtin" ? <Badge>Built-in</Badge> : null,
      ]}
      info={[
        plugin.description ? <ExtCardDesc html={raw(renderMdInline(plugin.description))} /> : null,
        extCardVersionWarningNode(plugin),
      ]}
      actions={[
        extCardBadgeNode(plugin),
        extCardConfigureNode(plugin, () => openModal(plugin)),
        _canDisable(plugin) ? (
          <ExtToggle
            id={toggleId}
            inputClass="plugin-toggle-input"
            dataId={plugin.id}
            checked={isEnabled}
            onChange={extToggleHandler(plugin.id, isEnabled, "plugin")}
          />
        ) : null,
        orderable ? <DragHandle label={t("settings-page.extensions.drag-to-reorder")} /> : null,
      ]}
    />
  );
};

const _savePriorities = async (group: HTMLElement): Promise<void> => {
  const cards = group.querySelectorAll<HTMLElement>(".ext-card");
  const total = cards.length;
  await Promise.all(
    Array.from(cards).map((card, i) => {
      const id = card.dataset.id;
      if (!id) return Promise.resolve();
      return fetch(`${getBase()}/api/extensions/${encodeURIComponent(id)}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: String(total - 1 - i) }),
      });
    }),
  );
  window.dispatchEvent(new CustomEvent("extensions-saved"));
};

const _matches = (plugin: ExtensionMeta, query: string): boolean =>
  plugin.displayName.toLowerCase().includes(query) ||
  (plugin.description ?? "").toLowerCase().includes(query);

export function initPluginsTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("plugins-content");
  if (!container) return;

  const all = [...allExtensions.plugins].sort((a, b) => _priority(b) - _priority(a));

  render(
    <>
      <div class="store-filter-bar">
        <input
          type="text"
          class="degoog-search-bar degoog-search-bar--square-advanced plugins-search-input"
          placeholder="Search plugins…"
          value={_query.peek()}
          onInput={(event) => {
            _query.value = (event.target as HTMLInputElement).value.trim().toLowerCase();
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

  _disposeCards?.();
  _disposeCards = mount(() => {
    const query = _query.value;
    const visible = query ? all.filter((plugin) => _matches(plugin, query)) : all;
    return <>{visible.map((plugin) => <PluginCard key={plugin.id} plugin={plugin} orderable={true} />)}</>;
  }, cardsEl);
}
