import { escapeHtml } from "../../utils/dom";
import { extCardBadge, extCardConfigureBtn, extCardVersionWarning } from "../shared/ext-card";
import { getBase } from "../../utils/base-url";
import { applyThemeExtension } from "../../utils/theme";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { ExtensionMeta } from "../../types";

interface ApplyThemeResponse {
  ok: boolean;
  activeId: string | null;
  hasCss?: boolean;
  dataAttrs?: Record<string, string>;
}

const t = window.scopedT("core");
const themeT = window.scopedT("themes/degoog");

const _renderThemeCard = (
  themeExt: ExtensionMeta,
  activeId: string | null,
): string => {
  const themeId = themeExt.id;
  const isActive = activeId === themeId;
  const badge = extCardBadge(themeExt);
  const configureBtn = extCardConfigureBtn(themeExt);
  const activeLabel = isActive
    ? `<span class="ext-card-active">${escapeHtml(t("settings-page.extensions.active"))}</span>`
    : "";
  const versionWarning = extCardVersionWarning(themeExt);
  return `
    <div class="ext-card degoog-panel degoog-panel--ext-card" data-theme-id="${escapeHtml(themeId)}">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <span class="ext-card-name">${escapeHtml(themeExt.displayName)}</span>
          ${themeExt.description ? `<span class="ext-card-desc">${escapeHtml(themeExt.description)}</span>` : ""}
          ${activeLabel}
          ${versionWarning}
        </div>
        <div class="ext-card-actions">
          ${badge}
          ${configureBtn}
          <button class="ext-card-apply btn btn--secondary degoog-btn degoog-btn--secondary" data-theme-id="${escapeHtml(themeId)}" type="button" ${isActive ? "disabled" : ""}>${escapeHtml(themeT("search-templates.tabs.apply"))}</button>
        </div>
      </div>
    </div>`;
};

const _renderBuiltInCard = (activeId: string | null): string => {
  const isActive = activeId === null;
  return `
    <div class="ext-card degoog-panel degoog-panel--ext-card" data-theme-id="built-in">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <span class="ext-card-name">${escapeHtml(t("settings-page.extensions.built-in-theme-name"))}</span>
          <span class="ext-card-desc">${escapeHtml(t("settings-page.extensions.built-in-theme-desc"))}</span>
          ${isActive ? `<span class="ext-card-active">${escapeHtml(t("settings-page.extensions.active"))}</span>` : ""}
        </div>
        <div class="ext-card-actions">
          <button class="ext-card-apply btn btn--secondary degoog-btn degoog-btn--secondary" data-theme-id="built-in" type="button" ${isActive ? "disabled" : ""}>${escapeHtml(themeT("search-templates.tabs.apply"))}</button>
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
  container.classList.remove("themes-applying");

  const activeId = themesData.activeId;
  container.dataset.activeThemeId = activeId ?? "built-in";
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

  let applying = false;

  container
    .querySelectorAll<HTMLButtonElement>(".ext-card-apply")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (applying) return;
        applying = true;
        btn.classList.add("ext-card-apply--loading");
        _setThemesLocked(container, true);
        try {
          const res = await fetch(`${getBase()}/api/theme/active`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: btn.dataset.themeId === "built-in" ? null : (btn.dataset.themeId ?? null),
            }),
          });
          if (!res.ok) throw new Error("Failed");
          const data = (await res.json()) as ApplyThemeResponse;
          await applyThemeExtension({
            hasCss: !!data.hasCss,
            dataAttrs: data.dataAttrs ?? {},
          });
          // Re-render with the new active theme; this rebuilds the cards
          // (active badge + disabled state) and re-binds fresh listeners.
          await initThemesTab({ activeId: data.activeId ?? null }, themeExts);
        } catch {
          btn.classList.remove("ext-card-apply--loading");
          _setThemesLocked(container, false);
          applying = false;
        }
      });
    });
}

const _setThemesLocked = (container: HTMLElement, locked: boolean): void => {
  container.classList.toggle("themes-applying", locked);
  container
    .querySelectorAll<HTMLButtonElement>(".ext-card-apply")
    .forEach((b) => {
      if (locked) {
        b.disabled = true;
      } else {
        b.disabled = b.dataset.themeId === container.dataset.activeThemeId;
      }
    });
};
