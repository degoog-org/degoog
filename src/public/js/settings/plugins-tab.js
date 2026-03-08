import { openModal } from "./modal.js";

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function isConfigured(plugin) {
  return plugin.settingsSchema
    .filter((f) => f.required)
    .every((f) => {
      const v = plugin.settings[f.key];
      return v && v !== "";
    });
}

function renderPluginCard(plugin) {
  const isEnabled = plugin.settings["disabled"] !== "true";
  const trigger = plugin.settingsSchema.length === 0
    ? `<span class="ext-card-trigger">!${escapeHtml(plugin.id)}</span>`
    : "";
  const desc = plugin.description
    ? `<span class="ext-card-desc">${escapeHtml(plugin.description)}</span>`
    : "";
  const configured = plugin.configurable && isConfigured(plugin);
  const badge = configured ? `<span class="ext-configured-badge"></span>` : "";
  const configureBtn = plugin.configurable
    ? `<button class="ext-card-configure" data-id="${escapeHtml(plugin.id)}" type="button">Configure</button>`
    : "";
  const canDisable = plugin.configurable || plugin.id.startsWith("plugin-") || plugin.id.startsWith("slot-");
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
}

export function initPluginsTab(allExtensions) {
  const container = document.getElementById("plugins-content");
  if (!container) return;

  const custom = allExtensions.plugins.filter(
    (p) => p.id.startsWith("plugin-") || p.id.startsWith("slot-"),
  );
  const builtin = allExtensions.plugins.filter(
    (p) => !p.id.startsWith("plugin-") && !p.id.startsWith("slot-"),
  );

  let html = "";

  if (custom.length > 0) {
    html += `<div class="ext-group"><h3 class="ext-group-label">Plugins</h3><div class="ext-cards">`;
    for (const plugin of custom) {
      html += renderPluginCard(plugin);
    }
    html += `</div></div>`;
  }

  if (builtin.length > 0) {
    html += `<div class="ext-group"><h3 class="ext-group-label">Built-in commands</h3><div class="ext-cards">`;
    for (const plugin of builtin) {
      html += renderPluginCard(plugin);
    }
    html += `</div></div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll(".plugin-toggle-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.dataset.id;
      const disabled = !input.checked;
      const res = await fetch(`/api/extensions/${encodeURIComponent(id)}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: disabled ? "true" : "" }),
      });
      if (res.ok) window.dispatchEvent(new CustomEvent("extensions-saved"));
    });
  });

  container.querySelectorAll(".ext-card-configure").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const ext = allExtensions.plugins.find((p) => p.id === id);
      if (ext) openModal(ext);
    });
  });
}
