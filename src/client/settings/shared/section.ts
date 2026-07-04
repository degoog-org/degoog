import { escapeHtml } from "../../utils/dom";
import type {
  NumberOpts,
  SectionOpts,
  TextareaOpts,
  ToggleOpts,
} from "../../types/settings-section";

const t = window.scopedT("core");

export const renderToggle = (opts: ToggleOpts): string => {
  const ariaAttr = opts.ariaKey ? ` aria-label="${escapeHtml(t(opts.ariaKey))}"` : "";
  const titleAttr = opts.titleKey ? ` title="${escapeHtml(t(opts.titleKey))}"` : "";
  const checkedAttr = opts.checked ? " checked" : "";
  return `<label class="settings-toggle-wrap degoog-toggle-wrap"${titleAttr}>
      <input type="checkbox" id="${opts.id}" class="settings-toggle"${ariaAttr}${checkedAttr} />
      <span class="toggle-slider degoog-toggle"></span>
      <span class="settings-toggle-label">${escapeHtml(t(opts.labelKey))}</span>
    </label>`;
};

export const renderCheckbox = (opts: ToggleOpts): string => {
  const ariaAttr = opts.ariaKey ? ` aria-label="${escapeHtml(t(opts.ariaKey))}"` : "";
  const titleAttr = opts.titleKey ? ` title="${escapeHtml(t(opts.titleKey))}"` : "";
  const checkedAttr = opts.checked ? " checked" : "";
  return `<label class="degoog-checkbox-wrap"${titleAttr}>
      <input type="checkbox" id="${opts.id}" class="settings-toggle"${ariaAttr}${checkedAttr} />
      <span class="degoog-checkbox"><i class="fa-solid fa-check"></i></span>
      <span class="settings-toggle-label">${escapeHtml(t(opts.labelKey))}</span>
    </label>`;
};

export const renderDesc = (key: string): string =>
  `<p class="settings-desc">${escapeHtml(t(key))}</p>`;

export const renderTextarea = (opts: TextareaOpts): string => {
  const phAttr = opts.placeholder ? ` placeholder="${escapeHtml(opts.placeholder)}"` : "";
  const descHtml = opts.descKey ? renderDesc(opts.descKey) : "";
  return `<label for="${opts.id}" class="settings-proxy-urls-label">${escapeHtml(t(opts.labelKey))}</label>
    ${descHtml}
    <textarea id="${opts.id}" class="settings-proxy-urls degoog-input" rows="${opts.rows ?? 5}"${phAttr}></textarea>`;
};

export const renderNumber = (opts: NumberOpts): string => {
  const cls = opts.inline
    ? "settings-rate-limit-input settings-rate-limit-input--inline degoog-input"
    : "settings-rate-limit-input degoog-input";
  const minAttr = opts.min !== undefined ? ` min="${opts.min}"` : "";
  const maxAttr = opts.max !== undefined ? ` max="${opts.max}"` : "";
  const stepAttr = opts.step !== undefined ? ` step="${opts.step}"` : "";
  const phAttr = opts.placeholder ? ` placeholder="${escapeHtml(opts.placeholder)}"` : "";
  return `<label for="${opts.id}" class="settings-proxy-urls-label">${escapeHtml(t(opts.labelKey))}</label>
    <input type="number" id="${opts.id}" class="${cls}"${minAttr}${maxAttr}${stepAttr}${phAttr} />`;
};

export const renderSection = (opts: SectionOpts): string => {
  const idAttr = opts.id ? ` id="${opts.id}"` : "";
  const descHtml = opts.descKey ? renderDesc(opts.descKey) : "";
  const fsCls = opts.fieldsetClass
    ? `settings-fieldset ${opts.fieldsetClass}`
    : "settings-fieldset";
  const inner = opts.noFieldset
    ? opts.content
    : `<fieldset class="${fsCls}">${opts.content}</fieldset>`;

  if (!opts.icon) {
    return `<section class="settings-section ext-card degoog-panel degoog-panel--ext-card"${idAttr}>
        <h2 class="settings-section-heading">${escapeHtml(t(opts.headingKey))}</h2>
        ${descHtml}
        ${inner}
      </section>`;
  }

  return `<section class="settings-section ext-card degoog-panel degoog-panel--ext-card"${idAttr}>
      <div class="setting-section-heading-wrapper">
        <h2 class="settings-section-heading">${escapeHtml(t(opts.headingKey))}</h2>
        <div class="floating-section-icon"><i class="${opts.icon}"></i></div>
      </div>
      ${descHtml}
      ${inner}
    </section>`;
};
