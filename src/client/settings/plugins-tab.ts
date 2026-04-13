import { escapeHtml, getConfigStatus } from "../utils/dom";
import { openModal } from "../modules/modals/settings-modal/modal";
import type { ExtensionMeta, AllExtensions } from "../types";

const t = window.scopedT("core");

const _arrowUp = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`;
const _arrowDown = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;

const _renderPluginCard = (plugin: ExtensionMeta, index: number, total: number): string => {
  const isEnabled = plugin.settings["disabled"] !== "true";
  const trigger =
    plugin.settingsSchema.length === 0
      ? `<span class="ext-card-trigger">!${escapeHtml(plugin.id)}</span>`
      : "";
  const desc = plugin.description
    ? `<span class="ext-card-desc">${escapeHtml(plugin.description)}</span>`
    : "";
  const status = plugin.configurable ? getConfigStatus(plugin) : null;
  const badge =
    status === "configured"
      ? '<span class="ext-configured-badge"></span>'
      : status === "needs-config"
        ? '<span class="ext-needs-config-badge"></span>'
        : "";
  const configureBtn = plugin.configurable
    ? `<button class="ext-card-configure" data-id="${escapeHtml(plugin.id)}" type="button">${escapeHtml(t("settings-page.extensions.configure"))}</button>`
    : "";
  const canDisable =
    plugin.configurable ||
    plugin.id.startsWith("plugin-") ||
    plugin.id.startsWith("slot-");
  const toggle = canDisable
    ? `<label class="engine-toggle">
        <input type="checkbox" class="plugin-toggle-input" data-id="${escapeHtml(plugin.id)}" ${isEnabled ? "checked" : ""}>
        <span class="toggle-slider"></span>
      </label>`
    : "";

  return `
    <div class="ext-card" data-id="${escapeHtml(plugin.id)}">
      <div class="ext-card-reorder">
        <button class="ext-card-arrow" data-id="${escapeHtml(plugin.id)}" data-direction="up" type="button" ${index === 0 ? "disabled" : ""}>${_arrowUp}</button>
        <button class="ext-card-arrow" data-id="${escapeHtml(plugin.id)}" data-direction="down" type="button" ${index === total - 1 ? "disabled" : ""}>${_arrowDown}</button>
      </div>
      <div class="ext-card-main">
        <div class="ext-card-info">
          <span class="ext-card-name">${escapeHtml(plugin.displayName)}</span>
          ${trigger}
          ${desc}
        </div>
        <div class="ext-card-actions">
          ${badge}
          ${configureBtn}
          ${toggle}
        </div>
      </div>
    </div>`;
};

export function initPluginsTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("plugins-content");
  if (!container) return;

  const custom = allExtensions.plugins.filter((p) => p.source === "plugin");
  const builtin = allExtensions.plugins.filter((p) => p.source !== "plugin");

  function render(): void {
    let html = "";
    if (custom.length > 0) {
      html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(t("settings-page.extensions.group-plugins"))}</h3><div class="ext-cards">`;
      for (let i = 0; i < custom.length; i++) html += _renderPluginCard(custom[i], i, custom.length);
      html += `</div></div>`;
    }
    if (builtin.length > 0) {
      html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(t("settings-page.extensions.group-builtin-commands"))}</h3><div class="ext-cards">`;
      for (let i = 0; i < builtin.length; i++) html += _renderPluginCard(builtin[i], i, builtin.length);
      html += `</div></div>`;
    }
    container!.innerHTML = html;
    _bindEvents();
  }

  function _saveOrder(): void {
    const order = [...custom, ...builtin].map((p) => p.id);
    fetch("/api/extensions/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
  }

  function _swapInGroup(group: ExtensionMeta[], id: string, direction: "up" | "down"): void {
    const idx = group.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= group.length) return;
    [group[idx], group[target]] = [group[target], group[idx]];
    render();
    _saveOrder();
  }

  function _bindEvents(): void {
    container!
      .querySelectorAll<HTMLButtonElement>(".ext-card-arrow")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          const direction = btn.dataset.direction as "up" | "down";
          if (!id) return;
          if (custom.some((p) => p.id === id)) {
            _swapInGroup(custom, id, direction);
          } else {
            _swapInGroup(builtin, id, direction);
          }
        });
      });

    container!
      .querySelectorAll<HTMLInputElement>(".plugin-toggle-input")
      .forEach((input) => {
        input.addEventListener("change", async () => {
          const id = input.dataset.id;
          if (!id) return;
          const disabled = !input.checked;
          const res = await fetch(
            `/api/extensions/${encodeURIComponent(id)}/settings`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ disabled: disabled ? "true" : "" }),
            },
          );
          if (res.ok) window.dispatchEvent(new CustomEvent("extensions-saved"));
        });
      });

    container!
      .querySelectorAll<HTMLElement>(".ext-card-configure")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          const ext = allExtensions.plugins.find((p) => p.id === id);
          if (ext) openModal(ext);
        });
      });
  }

  render();
}
