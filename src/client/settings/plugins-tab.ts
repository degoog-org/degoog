import { escapeHtml, getConfigStatus } from "../utils/dom";
import { openModal } from "../modules/modals/settings-modal/modal";
import type { ExtensionMeta, AllExtensions } from "../types";

const t = window.scopedT("core");

const _renderPluginCard = (plugin: ExtensionMeta): string => {
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

  let html = "";
  if (custom.length > 0) {
    html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(t("settings-page.extensions.group-plugins"))}</h3><div class="ext-cards">`;
    for (const plugin of custom) html += _renderPluginCard(plugin);
    html += `</div></div>`;
  }
  if (builtin.length > 0) {
    html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(t("settings-page.extensions.group-builtin-commands"))}</h3><div class="ext-cards">`;
    for (const plugin of builtin) html += _renderPluginCard(plugin);
    html += `</div></div>`;
  }
  container.innerHTML = html;

  container
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

  container
    .querySelectorAll<HTMLElement>(".ext-card-configure")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const ext = allExtensions.plugins.find((p) => p.id === id);
        if (ext) openModal(ext);
      });
    });
}
