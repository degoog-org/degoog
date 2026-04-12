import { escapeHtml, getConfigStatus } from "../utils/dom";
import { openModal } from "../modules/modals/settings-modal/modal";
import type { ExtensionMeta, AllExtensions } from "../types";

const t = window.scopedT("core");

const _renderTransportCard = (transport: ExtensionMeta): string => {
  const isEnabled = transport.settings["disabled"] !== "true";
  const desc = transport.description
    ? `<span class="ext-card-desc">${escapeHtml(transport.description)}</span>`
    : "";
  const status = transport.configurable ? getConfigStatus(transport) : null;
  const badge =
    status === "configured"
      ? '<span class="ext-configured-badge"></span>'
      : status === "needs-config"
        ? '<span class="ext-needs-config-badge"></span>'
        : "";
  const configureBtn = transport.configurable
    ? `<button class="ext-card-configure" data-id="${escapeHtml(transport.id)}" type="button">${escapeHtml(t("settings-page.extensions.configure"))}</button>`
    : "";
  const toggle = transport.configurable
    ? `<label class="engine-toggle">
        <input type="checkbox" class="transport-toggle-input" data-id="${escapeHtml(transport.id)}" ${isEnabled ? "checked" : ""}>
        <span class="toggle-slider"></span>
      </label>`
    : "";

  return `
    <div class="ext-card" data-id="${escapeHtml(transport.id)}">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <span class="ext-card-name">${escapeHtml(transport.displayName)}</span>
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

export function initTransportsTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("transports-content");
  if (!container) return;

  const transports = allExtensions.transports ?? [];

  const BUILTIN_IDS = new Set([
    "transport-fetch",
    "transport-curl",
    "transport-curl-fallback",
  ]);
  const custom = transports.filter(
    (transport) => !BUILTIN_IDS.has(transport.id),
  );
  const builtin = transports.filter((transport) =>
    BUILTIN_IDS.has(transport.id),
  );

  let html = "";
  if (custom.length > 0) {
    html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(t("settings-page.extensions.group-transports"))}</h3><div class="ext-cards">`;
    for (const transport of custom) html += _renderTransportCard(transport);
    html += "</div></div>";
  }
  if (builtin.length > 0) {
    html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(t("settings-page.extensions.group-builtin-transports"))}</h3><div class="ext-cards">`;
    for (const transport of builtin) html += _renderTransportCard(transport);
    html += "</div></div>";
  }
  container.innerHTML = html;

  container
    .querySelectorAll<HTMLInputElement>(".transport-toggle-input")
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
        const ext = transports.find((transport) => transport.id === id);
        if (ext) openModal(ext);
      });
    });
}
