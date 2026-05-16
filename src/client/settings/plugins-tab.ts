import { escapeHtml, getConfigStatus } from "../utils/dom";
import { openModal } from "../modules/modals/settings-modal/modal";
import type { ExtensionMeta, AllExtensions } from "../types";
import { getBase } from "../utils/base-url";

const t = window.scopedT("core");

const _priority = (plugin: ExtensionMeta): number => {
  const v = plugin.settings["priority"];
  const n = parseInt(typeof v === "string" ? v : "0", 10);
  return isNaN(n) ? 0 : n;
};

const _exposureIcon = (plugin: ExtensionMeta): string => {
  if (plugin.isClientExposed === true) {
    return `<span class="degoog-badge degoog-badge--proxy-exposed" data-tooltip="${escapeHtml(t("settings-page.extensions.exposure-exposed"))}"><i class="fa-solid fa-triangle-exclamation"></i></span>`;
  }
  if (plugin.isClientExposed === false) {
    return `<span class="degoog-badge degoog-badge--proxy-safe" data-tooltip="${escapeHtml(t("settings-page.extensions.exposure-safe"))}"><i class="fa-solid fa-circle-check"></i></span>`;
  }
  return `<span class="degoog-badge degoog-badge--proxy-unknown" data-tooltip="${escapeHtml(t("settings-page.extensions.exposure-unknown"))}"><i class="fa-solid fa-circle-info"></i></span>`;
};

const _renderPluginCard = (
  plugin: ExtensionMeta,
  orderable: boolean,
): string => {
  const isEnabled = plugin.settings["disabled"] !== "true";
  const trigger =
    plugin.type === "command" && plugin.trigger
      ? `<span class="ext-card-trigger">!${escapeHtml(plugin.trigger)}</span>`
      : "";
  const builtinBadge =
    plugin.source === "builtin"
      ? `<span class="degoog-badge">Built-in</span>`
      : "";
  const exposureIcon = _exposureIcon(plugin);
  const desc = plugin.description
    ? `<span class="ext-card-desc">${escapeHtml(plugin.description)}</span>`
    : "";
  const versionWarning = plugin.requiresNewerVersion
    ? `<span class="ext-version-warning">Requires a newer version of Degoog</span>`
    : "";
  const status = plugin.configurable ? getConfigStatus(plugin) : null;
  const badge =
    status === "configured"
      ? `<span class="ext-configured-badge" data-tooltip="${escapeHtml(t("settings-page.extensions.status-configured"))}"></span>`
      : status === "needs-config"
        ? `<span class="ext-needs-config-badge" data-tooltip="${escapeHtml(t("settings-page.extensions.status-needs-config"))}"></span>`
        : "";
  const configureBtn = plugin.configurable
    ? `<button class="ext-card-configure btn btn--secondary degoog-btn degoog-btn--secondary" data-id="${escapeHtml(plugin.id)}" type="button">${escapeHtml(t("settings-page.extensions.configure"))}</button>`
    : "";
  const canDisable =
    plugin.configurable ||
    plugin.id.startsWith("plugin-") ||
    plugin.id.startsWith("slot-");
  const toggle = canDisable
    ? `<label class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
        <input type="checkbox" class="plugin-toggle-input" id="plugin-toggle-${escapeHtml(plugin.id)}" data-id="${escapeHtml(plugin.id)}" ${isEnabled ? "checked" : ""}>
        <span class="toggle-slider degoog-toggle"></span>
      </label>`
    : "";

  const orderBtns = orderable
    ? `<div class="degoog-card-order">
        <button class="degoog-icon-btn degoog-card-order-btn" data-id="${escapeHtml(plugin.id)}" data-dir="up" title="Move up" type="button"><i class="fa-solid fa-chevron-up"></i></button>
        <button class="degoog-icon-btn degoog-card-order-btn" data-id="${escapeHtml(plugin.id)}" data-dir="down" title="Move down" type="button"><i class="fa-solid fa-chevron-down"></i></button>
      </div>`
    : "";

  return `
    <div class="ext-card degoog-panel degoog-panel--ext-card" data-id="${escapeHtml(plugin.id)}">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <div class="ext-card-name-row">
            <label for="plugin-toggle-${escapeHtml(plugin.id)}" class="ext-card-name plugin-toggle-label">${escapeHtml(plugin.displayName)}</label>
            ${builtinBadge}
            ${exposureIcon}
          </div>
          ${trigger}
          ${desc}
          ${versionWarning}
        </div>
        <div class="ext-card-actions">
          ${badge}
          ${configureBtn}
          ${toggle}
          ${orderBtns}
        </div>
      </div>
    </div>`;
};

const _refreshOrderBtns = (group: HTMLElement): void => {
  const cards = group.querySelectorAll<HTMLElement>(".ext-card");
  cards.forEach((card, i) => {
    const up = card.querySelector<HTMLButtonElement>('[data-dir="up"]');
    const down = card.querySelector<HTMLButtonElement>('[data-dir="down"]');
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === cards.length - 1;
  });
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

export function initPluginsTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("plugins-content");
  if (!container) return;

  const all = [...allExtensions.plugins].sort(
    (a, b) => _priority(b) - _priority(a),
  );

  let html = `<div class="ext-group"><div class="ext-cards ext-cards--orderable">`;
  for (const plugin of all) html += _renderPluginCard(plugin, true);
  html += `</div></div>`;
  container.innerHTML = html;

  container
    .querySelectorAll<HTMLElement>(".ext-cards--orderable")
    .forEach(_refreshOrderBtns);

  container
    .querySelectorAll<HTMLInputElement>(".plugin-toggle-input")
    .forEach((input) => {
      input.addEventListener("change", async () => {
        const id = input.dataset.id;
        if (!id) return;
        const disabled = !input.checked;
        const res = await fetch(
          `${getBase()}/api/extensions/${encodeURIComponent(id)}/settings`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ disabled: disabled ? "true" : "" }),
          },
        );
        if (res.ok) window.dispatchEvent(new CustomEvent("extensions-saved"));
      });
    });

  container
    .querySelectorAll<HTMLElement>(".ext-card-configure")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const ext = allExtensions.plugins.find((p) => p.id === id);
        if (ext) openModal(ext);
      });
    });

  container
    .querySelectorAll<HTMLButtonElement>(".degoog-card-order-btn")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest<HTMLElement>(".ext-card");
        const cardsEl = btn.closest<HTMLElement>(".ext-cards--orderable");
        if (!card || !cardsEl) return;
        if (btn.dataset.dir === "up") {
          const prev = card.previousElementSibling as HTMLElement | null;
          if (prev) cardsEl.insertBefore(card, prev);
        } else {
          const next = card.nextElementSibling as HTMLElement | null;
          if (next) cardsEl.insertBefore(next, card);
        }
        _refreshOrderBtns(cardsEl);
        void _savePriorities(cardsEl);
      });
    });
}
