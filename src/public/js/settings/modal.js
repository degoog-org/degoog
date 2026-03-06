const overlay = document.getElementById("ext-modal-overlay");
const modal = document.getElementById("ext-modal");
const titleEl = document.getElementById("ext-modal-title");
const bodyEl = document.getElementById("ext-modal-body");
const saveBtn = document.getElementById("ext-modal-save");
const closeBtn = document.getElementById("ext-modal-close");
const statusEl = document.getElementById("ext-modal-status");

let currentExt = null;

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function renderField(field, currentValue) {
  const isSecret = field.secret === true;
  const isSet = currentValue === "__SET__";
  const displayValue = isSecret ? "" : (currentValue || "");
  const configuredClass = isSecret && isSet ? " ext-field-input--configured" : "";
  const placeholder = isSecret && isSet
    ? "••••••••"
    : (field.placeholder || "");

  const descHtml = field.description
    ? `<p class="ext-field-desc">${escapeHtml(field.description)}</p>`
    : "";

  if (field.type === "toggle") {
    const checked = currentValue === "true" ? "checked" : "";
    return `
      <div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="toggle">
        <label class="ext-field-toggle-row">
          <span class="ext-field-label">${escapeHtml(field.label)}</span>
          <label class="engine-toggle">
            <input type="checkbox" id="field-${escapeHtml(field.key)}" ${checked}>
            <span class="toggle-slider"></span>
          </label>
        </label>
        ${descHtml}
      </div>`;
  }

  if (field.type === "textarea") {
    return `
      <div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="textarea" data-secret="${isSecret}" data-was-set="${isSet}">
        <label class="ext-field-label" for="field-${escapeHtml(field.key)}">${escapeHtml(field.label)}${field.required ? " <span class='ext-required'>*</span>" : ""}</label>
        <textarea
          class="ext-field-input ext-field-textarea${configuredClass}"
          id="field-${escapeHtml(field.key)}"
          placeholder="${escapeHtml(placeholder)}"
          rows="6"
          autocomplete="off"
        >${escapeHtml(displayValue)}</textarea>
        ${descHtml}
      </div>`;
  }

  const inputType = field.type === "password" ? "password" : (field.type === "url" ? "url" : "text");
  return `
    <div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="${escapeHtml(field.type)}" data-secret="${isSecret}" data-was-set="${isSet}">
      <label class="ext-field-label" for="field-${escapeHtml(field.key)}">${escapeHtml(field.label)}${field.required ? " <span class='ext-required'>*</span>" : ""}</label>
      <input
        class="ext-field-input${configuredClass}"
        type="${inputType}"
        id="field-${escapeHtml(field.key)}"
        value="${escapeHtml(displayValue)}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="off"
      >
      ${descHtml}
    </div>`;
}

function collectValues() {
  const values = {};
  bodyEl.querySelectorAll(".ext-field").forEach((fieldEl) => {
    const key = fieldEl.dataset.key;
    const type = fieldEl.dataset.type;
    const isSecret = fieldEl.dataset.secret === "true";
    const wasSet = fieldEl.dataset.wasSet === "true";

    if (type === "toggle") {
      const input = fieldEl.querySelector("input[type=checkbox]");
      values[key] = input.checked ? "true" : "false";
      return;
    }

    const input = fieldEl.querySelector("textarea") || fieldEl.querySelector("input");
    const val = input.value.trim();

    if (isSecret) {
      if (val === "" && wasSet) return;
      values[key] = val;
    } else {
      values[key] = val;
    }
  });
  return values;
}

export function openModal(ext) {
  currentExt = ext;
  titleEl.textContent = `Configure ${ext.displayName}`;
  statusEl.textContent = "";

  bodyEl.innerHTML = ext.settingsSchema
    .map((field) => renderField(field, ext.settings[field.key] ?? ""))
    .join("");

  bodyEl.querySelectorAll(".ext-field-input--configured").forEach((input) => {
    input.addEventListener("focus", () => input.classList.remove("ext-field-input--configured"), { once: true });
  });

  overlay.style.display = "flex";
  const firstInput = bodyEl.querySelector("input, textarea");
  if (firstInput) firstInput.focus();
}

export function closeModal() {
  overlay.style.display = "none";
  currentExt = null;
  statusEl.textContent = "";
}

async function save() {
  if (!currentExt) return;
  const values = collectValues();
  saveBtn.disabled = true;
  statusEl.textContent = "Saving…";
  try {
    const res = await fetch(`/api/extensions/${encodeURIComponent(currentExt.id)}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error("Failed");
    statusEl.textContent = "Saved";
    setTimeout(closeModal, 800);
  } catch {
    statusEl.textContent = "Save failed. Please try again.";
  } finally {
    saveBtn.disabled = false;
  }
}

saveBtn.addEventListener("click", save);
closeBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
