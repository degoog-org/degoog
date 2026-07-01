import { escapeHtml, getConfigStatus } from "../../utils/dom";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { ExtensionMeta, AllExtensions } from "../../types";
import { getBase } from "../../utils/base-url";
import { renderMdInline } from "../../utils/md";
import { flashError, flashSuccess } from "../shared/flash-msg";

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
  const builtinBadge =
    plugin.source === "builtin"
      ? `<span class="degoog-badge">Built-in</span>`
      : "";
  const exposureIcon = _exposureIcon(plugin);
  const desc = plugin.description
    ? `<span class="ext-card-desc">${renderMdInline(plugin.description)}</span>`
    : "";
  const versionWarning = plugin.requiresNewerVersion
    ? `<span class="ext-version-warning">${escapeHtml(t("settings-page.extensions.requires-newer-version"))}</span>`
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
    plugin.id.endsWith("-slot") ||
    (plugin.id.endsWith("-command") && plugin.source !== "builtin");
  const toggle = canDisable
    ? `<label class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
        <input type="checkbox" class="plugin-toggle-input" id="plugin-toggle-${escapeHtml(plugin.id)}" data-id="${escapeHtml(plugin.id)}" ${isEnabled ? "checked" : ""}>
        <span class="toggle-slider degoog-toggle"></span>
      </label>`
    : "";

  const orderBtns = orderable
    ? `<div class="degoog-card-order">
        <button class="degoog-icon-btn degoog-card-order-btn" data-id="${escapeHtml(plugin.id)}" data-dir="up" title="Move up" type="button"><i class="fa-solid fa-chevron-up"></i></button>
        <input type="number" class="degoog-card-order-pos" min="1" title="Position">
        <button class="degoog-icon-btn degoog-card-order-btn" data-id="${escapeHtml(plugin.id)}" data-dir="down" title="Move down" type="button"><i class="fa-solid fa-chevron-down"></i></button>
      </div>`
    : "";

  return `
    <div class="ext-card degoog-panel degoog-panel--ext-card" data-id="${escapeHtml(plugin.id)}">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <div class="ext-card-name-row">
            ${exposureIcon}
            <label for="plugin-toggle-${escapeHtml(plugin.id)}" class="ext-card-name plugin-toggle-label">${escapeHtml(plugin.displayName)}</label>
            ${builtinBadge}
          </div>
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

let _lastMovedId: string | null = null;

const _glowPos = (card: HTMLElement): void => {
  _lastMovedId = card.dataset.id ?? null;
  const pos = card.querySelector<HTMLInputElement>(".degoog-card-order-pos");
  if (!pos) return;
  pos.classList.remove("degoog-card-order-pos--glow");
  void pos.offsetWidth;
  pos.classList.add("degoog-card-order-pos--glow");
  pos.addEventListener("animationend", () => {
    pos.classList.remove("degoog-card-order-pos--glow");
    _lastMovedId = null;
  }, { once: true });
};

const _refreshOrderBtns = (group: HTMLElement): void => {
  const cards = group.querySelectorAll<HTMLElement>(".ext-card");
  cards.forEach((card, i) => {
    const up = card.querySelector<HTMLButtonElement>('[data-dir="up"]');
    const down = card.querySelector<HTMLButtonElement>('[data-dir="down"]');
    const pos = card.querySelector<HTMLInputElement>(".degoog-card-order-pos");
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === cards.length - 1;
    if (pos) {
      pos.value = String(i + 1);
      pos.max = String(cards.length);
    }
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

const _bindCards = (
  container: HTMLElement,
  all: ExtensionMeta[],
): void => {
  container
    .querySelectorAll<HTMLElement>(".ext-cards--orderable")
    .forEach(_refreshOrderBtns);

  container
    .querySelectorAll<HTMLInputElement>(".plugin-toggle-input")
    .forEach((input) => {
      let reqToken = 0;
      let confirmed = input.checked;
      input.addEventListener("change", async () => {
        const id = input.dataset.id;
        if (!id) return;
        const intended = input.checked;
        const disabled = !intended;
        const token = ++reqToken;
        try {
          const res = await fetch(
            `${getBase()}/api/extensions/${encodeURIComponent(id)}/settings`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ disabled: disabled ? "true" : "" }),
            },
          );
          if (!res.ok) throw new Error("save failed");
          if (token !== reqToken) return;
          confirmed = intended;
          window.dispatchEvent(new CustomEvent("extensions-saved"));
          flashSuccess(t("settings-page.server.saved"));
        } catch (err) {
          console.warn("[settings] plugin toggle failed", err);
          if (token !== reqToken) return;
          input.checked = confirmed;
          flashError(t("settings-page.server.save-failed-network"));
        }
      });
    });

  container
    .querySelectorAll<HTMLElement>(".ext-card-configure")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const ext = all.find((p) => p.id === id);
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
        _glowPos(card);
        void _savePriorities(cardsEl);
      });
    });

  container
    .querySelectorAll<HTMLInputElement>(".degoog-card-order-pos")
    .forEach((input) => {
      input.addEventListener("change", () => {
        const card = input.closest<HTMLElement>(".ext-card");
        const cardsEl = input.closest<HTMLElement>(".ext-cards--orderable");
        if (!card || !cardsEl) return;
        const cards = Array.from(cardsEl.querySelectorAll<HTMLElement>(".ext-card"));
        const target = Math.max(1, Math.min(cards.length, parseInt(input.value, 10) || 1)) - 1;
        const current = cards.indexOf(card);
        if (target === current) return;
        if (target >= cards.length - 1) {
          cardsEl.appendChild(card);
        } else {
          const ref = cards[target > current ? target + 1 : target];
          cardsEl.insertBefore(card, ref);
        }
        _refreshOrderBtns(cardsEl);
        _glowPos(card);
        void _savePriorities(cardsEl);
      });
    });
};

const _renderCards = (
  cardsEl: HTMLElement,
  plugins: ExtensionMeta[],
): void => {
  let html = "";
  for (const plugin of plugins) html += _renderPluginCard(plugin, true);
  cardsEl.innerHTML = html;
  _refreshOrderBtns(cardsEl);
  if (_lastMovedId) {
    const movedCard = cardsEl.querySelector<HTMLElement>(`.ext-card[data-id="${CSS.escape(_lastMovedId)}"]`);
    if (movedCard) _glowPos(movedCard);
  }
};

let _pluginSearchQuery = "";

export function initPluginsTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("plugins-content");
  if (!container) return;

  const all = [...allExtensions.plugins].sort(
    (a, b) => _priority(b) - _priority(a),
  );

  container.innerHTML = `
    <div class="store-filter-bar">
      <input type="text" class="degoog-search-bar degoog-search-bar--square-advanced plugins-search-input" placeholder="Search plugins…" value="${_pluginSearchQuery}">
    </div>
    <div class="ext-group"><div class="ext-cards ext-cards--orderable"></div></div>`;

  const cardsEl = container.querySelector<HTMLElement>(".ext-cards--orderable")!;

  const applyFilter = (q: string): void => {
    const filtered = q
      ? all.filter(
        (p) =>
          p.displayName.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      )
      : all;
    _renderCards(cardsEl, filtered);
    _bindCards(container, all);
  };

  applyFilter(_pluginSearchQuery);

  container
    .querySelector<HTMLInputElement>(".plugins-search-input")
    ?.addEventListener("input", (e) => {
      _pluginSearchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      applyFilter(_pluginSearchQuery);
    });
}
