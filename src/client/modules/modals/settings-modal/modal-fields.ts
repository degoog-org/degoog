import { escapeHtml } from "../../../utils/dom";
import type { SettingField, ExtensionMeta } from "../../../types";

const t = window.scopedT("core");

const _parseUrlListValue = (
  raw: string | string[] | undefined,
  defaultUrls: string[],
): string[] => {
  if (Array.isArray(raw)) {
    return raw.filter((u) => typeof u === "string" && u.startsWith("http"));
  }
  if (!raw || String(raw).trim() === "") return defaultUrls;
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return defaultUrls;
    return (parsed as unknown[]).filter(
      (u): u is string => typeof u === "string" && u.startsWith("http"),
    );
  } catch {
    return defaultUrls;
  }
};

const _renderUrlListField = (
  field: SettingField,
  ext: ExtensionMeta,
): string => {
  const defaultUrls = ext.defaultFeedUrls ?? [];
  const urls = _parseUrlListValue(
    ext.settings[field.key] as string | string[] | undefined,
    defaultUrls,
  );
  const descHtml = field.description
    ? `<p class="ext-field-desc">${escapeHtml(field.description)}</p>`
    : "";
  const listItems = urls
    .map(
      (url) =>
        `<li class="ext-field-urllist-item" data-url="${escapeHtml(url)}">
          <span class="ext-field-urllist-url">${escapeHtml(url)}</span>
          <button type="button" class="ext-field-urllist-remove" aria-label="${escapeHtml(t("settings-page.modal.field-remove-aria"))}">×</button>
        </li>`,
    )
    .join("");
  return `
    <div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="urllist">
      <label class="ext-field-label">${escapeHtml(field.label)}</label>
      <ul class="ext-field-urllist">${listItems}</ul>
      <div class="ext-field-urllist-add">
        <input type="url" class="ext-field-input ext-field-urllist-input" placeholder="${escapeHtml(field.placeholder || "https://example.com/feed.xml")}" autocomplete="off">
        <button type="button" class="ext-field-urllist-add-btn">${escapeHtml(t("settings-page.modal.field-add"))}</button>
      </div>
      <input type="hidden" id="field-${escapeHtml(field.key)}" class="ext-field-urllist-value">
      ${descHtml}
    </div>`;
};

export function initUrlList(container: HTMLElement): void {
  const field = container.querySelector<HTMLElement>(
    ".ext-field[data-type='urllist']",
  );
  if (!field) return;
  const listEl = field.querySelector<HTMLElement>(".ext-field-urllist");
  const addInput = field.querySelector<HTMLInputElement>(
    ".ext-field-urllist-input",
  );
  const addBtn = field.querySelector<HTMLElement>(".ext-field-urllist-add-btn");
  const hiddenInput = field.querySelector<HTMLInputElement>(
    ".ext-field-urllist-value",
  );
  if (!listEl || !addInput || !addBtn || !hiddenInput) return;

  const initialUrls = [
    ...listEl.querySelectorAll<HTMLElement>(".ext-field-urllist-item"),
  ]
    .map((li) => li.dataset.url || "")
    .filter(Boolean);
  hiddenInput.value = JSON.stringify(initialUrls);

  const getUrls = (): string[] => {
    try {
      const parsed = JSON.parse(hiddenInput?.value || "[]") as unknown;
      return Array.isArray(parsed)
        ? (parsed as unknown[]).filter(
            (u): u is string => typeof u === "string",
          )
        : [];
    } catch {
      return [];
    }
  };

  function setUrls(urls: string[]): void {
    if (hiddenInput) hiddenInput.value = JSON.stringify(urls);
  }

  function addUrl(url: string): void {
    const trimmed = url.trim();
    if (!trimmed.startsWith("http")) return;
    try {
      new URL(trimmed);
    } catch {
      return;
    }
    const urls = getUrls();
    if (urls.includes(trimmed)) return;
    urls.push(trimmed);
    setUrls(urls);
    const li = document.createElement("li");
    li.className = "ext-field-urllist-item";
    li.dataset.url = trimmed;
    li.innerHTML = `<span class="ext-field-urllist-url">${escapeHtml(trimmed)}</span><button type="button" class="ext-field-urllist-remove" aria-label="${escapeHtml(t("settings-page.modal.field-remove-aria"))}">×</button>`;
    li.querySelector(".ext-field-urllist-remove")?.addEventListener(
      "click",
      () => {
        setUrls(getUrls().filter((x) => x !== trimmed));
        li.remove();
      },
    );
    listEl?.appendChild(li);
  }

  field
    .querySelectorAll<HTMLElement>(".ext-field-urllist-remove")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const li = btn.closest<HTMLElement>(".ext-field-urllist-item");
        const url = li?.dataset?.url;
        if (!url) return;
        setUrls(getUrls().filter((u) => u !== url));
        li?.remove();
      });
    });

  addBtn.addEventListener("click", () => {
    if (addInput.value) {
      addUrl(addInput.value);
      addInput.value = "";
    }
  });
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (addInput.value) {
        addUrl(addInput.value);
        addInput.value = "";
      }
    }
  });
}

export const renderField = (
  field: SettingField,
  currentValue: string,
  ext: ExtensionMeta,
): string => {
  const isSecret = field.secret === true;
  const isSet = currentValue === "__SET__";
  const displayValue = isSecret ? "" : currentValue || "";
  const configuredClass =
    isSecret && isSet ? " ext-field-input--configured" : "";
  const placeholder = isSecret && isSet ? "••••••••" : field.placeholder || "";
  const descHtml = field.description
    ? `<p class="ext-field-desc">${escapeHtml(field.description)}</p>`
    : "";

  if (field.type === "urllist") {
    return _renderUrlListField(field, ext);
  }

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
        <textarea class="ext-field-input ext-field-textarea${configuredClass}" id="field-${escapeHtml(field.key)}" placeholder="${escapeHtml(placeholder)}" rows="6" autocomplete="off">${escapeHtml(displayValue)}</textarea>
        ${descHtml}
      </div>`;
  }

  if (
    field.type === "select" &&
    Array.isArray(field.options) &&
    field.options.length > 0
  ) {
    const validValue = field.options.includes(currentValue)
      ? currentValue
      : field.options[0];
    const opts = field.options
      .map(
        (v) =>
          `<option value="${escapeHtml(v)}"${validValue === v ? " selected" : ""}>${escapeHtml(v.charAt(0).toUpperCase() + v.slice(1))}</option>`,
      )
      .join("");
    return `
      <div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="select">
        <label class="ext-field-label" for="field-${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>
        <select id="field-${escapeHtml(field.key)}" class="ext-field-input ext-field-select">${opts}</select>
        ${descHtml}
      </div>`;
  }

  const inputType =
    field.type === "password"
      ? "password"
      : field.type === "url"
        ? "url"
        : field.type === "number"
          ? "number"
          : "text";
  return `
    <div class="ext-field" data-key="${escapeHtml(field.key)}" data-type="${escapeHtml(field.type)}" data-secret="${isSecret}" data-was-set="${isSet}">
      <label class="ext-field-label" for="field-${escapeHtml(field.key)}">${escapeHtml(field.label)}${field.required ? " <span class='ext-required'>*</span>" : ""}</label>
      <input class="ext-field-input${configuredClass}" type="${inputType}" id="field-${escapeHtml(field.key)}" value="${escapeHtml(displayValue)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off">
      ${descHtml}
    </div>`;
};
