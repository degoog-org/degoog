import { escapeHtml, getConfigStatus } from "../utils/dom";
import { openModal } from "../modules/modals/settings-modal/modal";
import type { ExtensionMeta } from "../types";

const t = window.scopedT("core");
const themeT = window.scopedT("themes/degoog");

const _themeIdFromExtId = (extId: string): string =>
  extId.startsWith("theme-") ? extId.slice(6) : extId;

const _renderThemeCard = (
  themeExt: ExtensionMeta,
  activeId: string | null,
): string => {
  const themeId = _themeIdFromExtId(themeExt.id);
  const isActive = activeId === themeId;
  const status = themeExt.configurable ? getConfigStatus(themeExt) : null;
  const badge =
    status === "configured"
      ? '<span class="ext-configured-badge"></span>'
      : status === "needs-config"
        ? '<span class="ext-needs-config-badge"></span>'
        : "";
  const configureBtn = themeExt.configurable
    ? `<button class="ext-card-configure" data-id="${escapeHtml(themeExt.id)}" type="button">${escapeHtml(t("settings-page.extensions.configure"))}</button>`
    : "";
  const activeLabel = isActive
    ? `<span class="ext-card-active">${escapeHtml(t("settings-page.extensions.active"))}</span>`
    : "";
  return `
    <div class="ext-card" data-theme-id="${escapeHtml(themeId)}">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <span class="ext-card-name">${escapeHtml(themeExt.displayName)}</span>
          ${themeExt.description ? `<span class="ext-card-desc">${escapeHtml(themeExt.description)}</span>` : ""}
          ${activeLabel}
        </div>
        <div class="ext-card-actions">
          ${badge}
          ${configureBtn}
          <button class="ext-card-apply" data-theme-id="${escapeHtml(themeId)}" type="button" ${isActive ? "disabled" : ""}>${escapeHtml(themeT("search-templates.tabs.apply"))}</button>
        </div>
      </div>
    </div>`;
};

const _renderBuiltInCard = (activeId: string | null): string => {
  const isActive = activeId === null;
  return `
    <div class="ext-card" data-theme-id="built-in">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <span class="ext-card-name">${escapeHtml(t("settings-page.extensions.built-in-theme-name"))}</span>
          <span class="ext-card-desc">${escapeHtml(t("settings-page.extensions.built-in-theme-desc"))}</span>
          ${isActive ? `<span class="ext-card-active">${escapeHtml(t("settings-page.extensions.active"))}</span>` : ""}
        </div>
        <div class="ext-card-actions">
          <button class="ext-card-apply" data-theme-id="built-in" type="button" ${isActive ? "disabled" : ""}>${escapeHtml(themeT("search-templates.tabs.apply"))}</button>
        </div>
      </div>
    </div>`;
};

export async function initThemesTab(
  themesData: { activeId: string | null },
  themeExts: ExtensionMeta[],
): Promise<void> {
  const container = document.getElementById("themes-content");
  if (!container) return;

  const activeId = themesData.activeId;
  let html = `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(t("settings-page.extensions.group-themes"))}</h3><div class="ext-cards">`;
  html += _renderBuiltInCard(activeId);
  for (const ext of themeExts) {
    html += _renderThemeCard(ext, activeId);
  }
  html += "</div></div>";
  container.innerHTML = html;

  container
    .querySelectorAll<HTMLElement>(".ext-card-configure")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const ext = themeExts.find((e) => e.id === id);
        if (ext) openModal(ext);
      });
    });

  container
    .querySelectorAll<HTMLButtonElement>(".ext-card-apply")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const rawId = btn.dataset.themeId;
        const id = rawId === "built-in" ? null : (rawId ?? null);
        btn.disabled = true;
        try {
          const res = await fetch("/api/theme/active", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          if (!res.ok) throw new Error("Failed");
          window.location.reload();
        } catch {
          btn.disabled = false;
        }
      });
    });
}
