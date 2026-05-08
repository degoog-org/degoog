import { escapeHtml, getConfigStatus } from "../utils/dom";
import { openModal } from "../modules/modals/settings-modal/modal";
import type { ExtensionMeta, AllExtensions } from "../types";
import { getBase } from "../utils/base-url";

const t = window.scopedT("core");

const BUILTIN_IDS = new Set([
  "autocomplete-builtin-google",
  "autocomplete-builtin-duckduckgo",
]);

const _renderAutocompleteCard = (provider: ExtensionMeta): string => {
  const isEnabled = provider.settings["disabled"] !== "true";
  const versionWarning = provider.requiresNewerVersion
    ? `<span class="ext-version-warning">Requires a newer version of Degoog</span>`
    : "";
  const status = provider.configurable ? getConfigStatus(provider) : null;
  const badge =
    status === "configured"
      ? '<span class="ext-configured-badge"></span>'
      : status === "needs-config"
        ? '<span class="ext-needs-config-badge"></span>'
        : "";
  const configureBtn = provider.configurable
    ? `<button class="ext-card-configure btn btn--secondary degoog-btn degoog-btn--secondary" data-id="${escapeHtml(provider.id)}" type="button">${escapeHtml(t("settings-page.extensions.configure"))}</button>`
    : "";
  return `
    <div class="ext-card degoog-panel degoog-panel--ext-card" data-id="${escapeHtml(provider.id)}">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <label for="autocomplete-toggle-${escapeHtml(provider.id)}" class="ext-card-name autocomplete-toggle-label">${escapeHtml(provider.displayName)}</label>
          ${versionWarning}
        </div>
        <div class="ext-card-actions">
          ${badge}
          ${configureBtn}
          <label class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
            <input type="checkbox" class="autocomplete-toggle-input" id="autocomplete-toggle-${escapeHtml(provider.id)}" data-id="${escapeHtml(provider.id)}" ${isEnabled ? "checked" : ""}>
            <span class="toggle-slider degoog-toggle"></span>
          </label>
        </div>
      </div>
    </div>`;
};

export function initAutocompleteTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("autocomplete-content");
  if (!container) return;

  const providers = allExtensions.autocomplete ?? [];

  const thirdParty = providers.filter((p) => !BUILTIN_IDS.has(p.id));
  const builtin = providers.filter((p) => BUILTIN_IDS.has(p.id));

  let html = "";
  if (thirdParty.length > 0) {
    html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(t("settings-page.extensions.group-autocomplete"))}</h3><div class="ext-cards">`;
    for (const provider of thirdParty)
      html += _renderAutocompleteCard(provider);
    html += "</div></div>";
  }
  if (builtin.length > 0) {
    html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(t("settings-page.extensions.group-builtin-autocomplete"))}</h3><div class="ext-cards">`;
    for (const provider of builtin) html += _renderAutocompleteCard(provider);
    html += "</div></div>";
  }
  container.innerHTML = html;

  container
    .querySelectorAll<HTMLInputElement>(".autocomplete-toggle-input")
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
        const ext = providers.find((p) => p.id === id);
        if (ext) openModal(ext);
      });
    });
}
