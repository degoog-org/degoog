import { idbGet, idbSet } from "../db.js";
import { SETTINGS_KEY } from "../constants.js";
import { openModal } from "./modal.js";

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

const SEARCH_TYPE_LABELS = {
  web: "Web",
  images: "Images",
  videos: "Videos",
  news: "News",
};

function groupByType(engines) {
  const groups = {};
  for (const engine of engines) {
    const type = engine.description.split(" ")[0].toLowerCase();
    const label = SEARCH_TYPE_LABELS[type] || "Other";
    if (!groups[label]) groups[label] = [];
    groups[label].push(engine);
  }
  return groups;
}

function isConfigured(ext) {
  return ext.settingsSchema
    .filter((f) => f.required)
    .every((f) => {
      const v = ext.settings[f.key];
      return v && v !== "";
    });
}

function renderEngineCard(engine, enabledMap) {
  const isEnabled = enabledMap[engine.id] !== false;
  const configured = engine.configurable && isConfigured(engine);
  const badge = configured ? `<span class="ext-configured-badge"></span>` : "";
  const configureBtn = engine.configurable
    ? `<button class="ext-card-configure" data-id="${escapeHtml(engine.id)}" type="button">Configure</button>`
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
}

export async function initEnginesTab(allExtensions) {
  const container = document.getElementById("engines-content");
  if (!container) return;

  const savedEngines = await idbGet(SETTINGS_KEY);
  const savedEnginesMap = savedEngines || {};
  const defaultsFromEngines = Object.fromEntries(
    allExtensions.engines.map((e) => [e.id, e.defaultEnabled !== false]),
  );
  const enabledMap = { ...defaultsFromEngines, ...savedEnginesMap };

  const groups = groupByType(allExtensions.engines);
  let html = "";
  for (const [label, engines] of Object.entries(groups)) {
    html += `<div class="ext-group"><h3 class="ext-group-label">${escapeHtml(label)}</h3><div class="ext-cards">`;
    for (const engine of engines) {
      html += renderEngineCard(engine, enabledMap);
    }
    html += `</div></div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll(".engine-toggle-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.dataset.id;
      enabledMap[id] = input.checked;
      await idbSet(SETTINGS_KEY, enabledMap);
    });
  });

  container.querySelectorAll(".ext-card-configure").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const ext = allExtensions.engines.find((e) => e.id === id);
      if (ext) openModal(ext);
    });
  });
}
