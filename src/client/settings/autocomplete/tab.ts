import { escapeHtml } from "../../utils/dom";
import {
  extCardBadge,
  extCardConfigureBtn,
  extCardRestartWarning,
  extCardVersionWarning,
} from "../shared/ext-card";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { ExtensionMeta, AllExtensions } from "../../types";
import { getBase } from "../../utils/base-url";
import { flashError, flashSuccess } from "../shared/flash-msg";

const t = window.scopedT("core");

const _renderAutocompleteCard = (provider: ExtensionMeta): string => {
  const isEnabled = provider.settings["disabled"] !== "true";
  const versionWarning = extCardVersionWarning(provider);
  const restartWarning = extCardRestartWarning(provider);
  const badge = extCardBadge(provider);
  const configureBtn = extCardConfigureBtn(provider);
  return `
    <div class="ext-card degoog-panel degoog-panel--ext-card" data-id="${escapeHtml(provider.id)}">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <div class="ext-card-name-row">
            ${restartWarning}
            <label for="autocomplete-toggle-${escapeHtml(provider.id)}" class="ext-card-name autocomplete-toggle-label">${escapeHtml(provider.displayName)}</label>
          </div>
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

  let html = "";
  if (providers.length > 0) {
    html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(t("settings-page.extensions.group-autocomplete"))}</h3><div class="ext-cards">`;
    for (const provider of providers) html += _renderAutocompleteCard(provider);
    html += "</div></div>";
  } else {
    const storeBtn = `<button class="degoog-link-btn" type="button" data-switch-tab="store">${escapeHtml(t("settings-page.extensions.no-autocomplete-store"))}</button>`;
    html += `<div class="ext-group"><p class="degoog-text degoog-text--sm degoog-text--secondary">${t("settings-page.extensions.no-autocomplete", { store: storeBtn })}</p></div>`;
  }
  container.innerHTML = html;

  container.querySelector<HTMLButtonElement>("[data-switch-tab]")?.addEventListener("click", (e) => {
    const tab = (e.currentTarget as HTMLButtonElement).dataset.switchTab;
    if (tab) document.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.click();
  });

  container
    .querySelectorAll<HTMLInputElement>(".autocomplete-toggle-input")
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
          console.warn("[settings] autocomplete toggle failed", err);
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
        const ext = providers.find((p) => p.id === id);
        if (ext) openModal(ext);
      });
    });
}
