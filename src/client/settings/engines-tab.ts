import { idbGet, idbSet } from "../utils/db";
import { SETTINGS_KEY } from "../constants";
import { escapeHtml, getConfigStatus } from "../utils/dom";
import { openModal } from "../modules/modals/settings-modal/modal";
import type { ExtensionMeta, EngineRecord, AllExtensions } from "../types";

const t = window.scopedT("core");
const themeT = window.scopedT("themes/degoog");

const TAB_TYPES = new Set(["web", "images", "videos", "news"]);

const _typeLabel = (type: string): string =>
  TAB_TYPES.has(type)
    ? themeT(`search-templates.tabs.${type}`)
    : type.charAt(0).toUpperCase() + type.slice(1);

const _groupByType = (
  engines: ExtensionMeta[],
): Record<string, ExtensionMeta[]> => {
  const groups: Record<string, ExtensionMeta[]> = {};
  for (const engine of engines) {
    const type = engine.description.split(" ")[0].toLowerCase();
    const label = _typeLabel(type);
    if (!groups[label]) groups[label] = [];
    groups[label].push(engine);
  }
  return groups;
};

const _renderEngineCard = (
  engine: ExtensionMeta,
  enabledMap: EngineRecord,
  allowConfigure: boolean,
): string => {
  const isEnabled = enabledMap[engine.id] !== false;
  const status =
    allowConfigure && engine.configurable ? getConfigStatus(engine) : null;
  const badge =
    status === "configured"
      ? '<span class="ext-configured-badge"></span>'
      : status === "needs-config"
        ? '<span class="ext-needs-config-badge"></span>'
        : "";
  const configureBtn =
    allowConfigure && engine.configurable
      ? `<button class="ext-card-configure" data-id="${escapeHtml(engine.id)}" type="button">${escapeHtml(t("settings-page.extensions.configure"))}</button>`
      : "";
  return `
    <div class="ext-card" data-id="${escapeHtml(engine.id)}">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <span class="ext-card-name">${escapeHtml(engine.displayName)}</span>
        </div>
        <div class="ext-card-actions">
          ${badge}
          ${configureBtn}
          <label class="engine-toggle">
            <input type="checkbox" class="engine-toggle-input" data-id="${escapeHtml(engine.id)}" ${isEnabled ? "checked" : ""}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>`;
};

export async function initEnginesTab(
  allExtensions: AllExtensions,
  options?: { publicInstance?: boolean },
): Promise<void> {
  const container = document.getElementById("engines-content");
  if (!container) return;
  const allowConfigure = !options?.publicInstance;

  const savedEngines = await idbGet<EngineRecord>(SETTINGS_KEY);
  const savedEnginesMap = savedEngines || {};
  const defaultsFromEngines = Object.fromEntries(
    allExtensions.engines.map((e) => [e.id, e.defaultEnabled !== false]),
  );
  const enabledMap: EngineRecord = {
    ...defaultsFromEngines,
    ...savedEnginesMap,
  };

  const groups = _groupByType(allExtensions.engines);
  let html = "";
  for (const [label, engines] of Object.entries(groups)) {
    html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(label)}</h3><div class="ext-cards">`;
    for (const engine of engines) {
      html += _renderEngineCard(engine, enabledMap, allowConfigure);
    }
    html += `</div></div>`;
  }
  if (allowConfigure) {
    html += `<div class="settings-page-actions"><button class="btn btn--secondary" id="save-default-engines" type="button">${t("settings-page.extensions.save-defaults")}</button></div>`;
  }
  container.innerHTML = html;

  container
    .querySelectorAll<HTMLInputElement>(".engine-toggle-input")
    .forEach((input) => {
      input.addEventListener("change", async () => {
        const id = input.dataset.id;
        if (id) enabledMap[id] = input.checked;
        await idbSet(SETTINGS_KEY, enabledMap);
      });
    });

  if (allowConfigure) {
    container
      .querySelectorAll<HTMLElement>(".ext-card-configure")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          const ext = allExtensions.engines.find((e) => e.id === id);
          if (ext) openModal(ext);
        });
      });

    document
      .getElementById("save-default-engines")
      ?.addEventListener("click", async () => {
        const btn = document.getElementById("save-default-engines");
        try {
          const token = sessionStorage.getItem("degoog-settings-token");
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (token) headers["x-settings-token"] = token;
          await fetch("/api/settings/default-engines", {
            method: "POST",
            headers,
            body: JSON.stringify(enabledMap),
          });
          if (btn) {
            const prev = btn.textContent;
            btn.textContent = t("settings-page.server.saved");
            setTimeout(() => {
              btn.textContent = prev;
            }, 1200);
          }
        } catch {
          if (btn)
            btn.textContent = t("settings-page.server.save-failed-network");
        }
      });
  }
}
