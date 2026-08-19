import { escapeHtml } from "../../utils/dom";
import { typeLabel } from "./type-label";
import type { SearxCatalogGroup, SearxCatalogItem } from "../../types/searx-catalog";

const t = window.scopedT("core");

const WEB_TYPE = "web";

export const searxFilter = (
  items: SearxCatalogItem[],
  query: string,
): SearxCatalogItem[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(needle) ||
      item.code.toLowerCase().includes(needle),
  );
};

export const searxGroups = (items: SearxCatalogItem[]): SearxCatalogGroup[] => {
  const map = new Map<string, SearxCatalogItem[]>();
  for (const item of items) {
    const key = (item.types[0] ?? WEB_TYPE).toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.keys()]
    .sort((a, b) => {
      if (a === WEB_TYPE) return -1;
      if (b === WEB_TYPE) return 1;
      return a.localeCompare(b);
    })
    .map((key) => ({
      key,
      label: typeLabel(key),
      items: (map.get(key) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
};

export const searxPackages = (item: SearxCatalogItem): string[] =>
  item.libs.filter((lib) => lib.missing).map((lib) => lib.package);

const _host = (site: string | undefined): string => {
  if (!site) return "";
  try {
    return new URL(site).hostname;
  } catch {
    return "";
  }
};

const _icon = (item: SearxCatalogItem): string => {
  const letter = escapeHtml((item.name[0] ?? "?").toUpperCase());
  const host = _host(item.site);
  if (!host) {
    return `<span class="degoog-result--favicon result-favicon-fallback" aria-hidden="true">${letter}</span>`;
  }
  return `<img class="degoog-result--favicon searx-favicon" alt="" loading="lazy" data-favicon-host="${escapeHtml(host)}" data-favicon-letter="${letter}">`;
};

const _missingDot = (): string =>
  `<span class="ext-needs-config-badge" data-tooltip="${escapeHtml(t("settings-page.extensions.searx-missing"))}" data-tooltip-below data-tooltip-end></span>`;

const _metaRow = (
  label: string,
  value: string,
  hint: string,
  missing = false,
): string => `
  <span class="ext-card-desc"><strong class="searx-meta-key" data-tooltip="${escapeHtml(hint)}" data-tooltip-below data-tooltip-start>${escapeHtml(label)}</strong>: ${escapeHtml(value)}${missing ? _missingDot() : ""}</span>`;

const _typesRow = (item: SearxCatalogItem): string => {
  const primary = (item.types[0] ?? WEB_TYPE).toLowerCase();
  const extras = item.types.filter((type) => type.toLowerCase() !== primary);
  if (!extras.length) return "";
  const labels = extras.map((type) => typeLabel(type.toLowerCase()));
  return _metaRow(
    t("settings-page.extensions.searx-types-label"),
    labels.join(", "),
    t("settings-page.extensions.searx-types-hint"),
  );
};

const _libsRow = (item: SearxCatalogItem): string => {
  if (!item.libs.length) return "";
  return _metaRow(
    t("settings-page.extensions.searx-libs-label"),
    item.libs.map((lib) => lib.module).join(", "),
    t("settings-page.extensions.searx-libs-hint"),
    searxPackages(item).length > 0,
  );
};

const _sharedRow = (item: SearxCatalogItem): string => {
  const deps = item.deps ?? [];
  if (!deps.length) return "";
  return _metaRow(
    t("settings-page.extensions.searx-shared-label"),
    deps.join(", "),
    t("settings-page.extensions.searx-shared-hint"),
  );
};

const _updateBtn = (item: SearxCatalogItem): string => {
  if (!item.installed) return "";
  const label = t("settings-page.extensions.searx-update");
  return `<button class="degoog-icon-btn degoog-icon-btn--padded searx-btn-update" type="button" data-code="${escapeHtml(item.code)}" data-tooltip="${escapeHtml(label)}" data-tooltip-below data-tooltip-end aria-label="${escapeHtml(label)}"><i class="fa-solid fa-arrows-rotate"></i></button>`;
};

const _card = (item: SearxCatalogItem): string => {
  const action = item.installed
    ? `<button class="btn btn--secondary degoog-btn degoog-btn--secondary degoog-btn--block searx-btn-uninstall" type="button" data-code="${escapeHtml(item.code)}">${escapeHtml(t("settings-page.extensions.searx-uninstall"))}</button>`
    : `<button class="btn btn--primary degoog-btn degoog-btn--primary degoog-btn--block searx-btn-install" type="button" data-code="${escapeHtml(item.code)}">${escapeHtml(t("settings-page.extensions.searx-install"))}</button>`;
  const installed = item.installed
    ? `<span class="ext-configured-badge" data-tooltip="${escapeHtml(t("settings-page.extensions.searx-installed"))}" data-tooltip-below data-tooltip-end></span>`
    : "";
  const meta = `${_typesRow(item)}${_libsRow(item)}${_sharedRow(item)}`;
  return `
    <div class="col-12 col-sm-6 col-md-4 ext-card degoog-panel degoog-panel--ext-card degoog-panel--in-modal degoog-vstack degoog-vstack--lg degoog-vstack--fill" data-code="${escapeHtml(item.code)}">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <div class="ext-card-name-row">
            ${_icon(item)}
            <span class="ext-card-name ext-card-name--lg">${escapeHtml(item.name)}</span>
          </div>
        </div>
        <div class="ext-card-actions">${installed}${_updateBtn(item)}</div>
      </div>
      ${meta ? `<div class="degoog-vstack degoog-vstack--sm degoog-vstack--meta">${meta}</div>` : ""}
      ${action}
    </div>`;
};

export const searxListHtml = (items: SearxCatalogItem[]): string => {
  if (!items.length) {
    return `<p class="ext-field-desc">${escapeHtml(t("settings-page.extensions.searx-empty"))}</p>`;
  }
  return searxGroups(items)
    .map(
      (group) => `
      <section class="ext-group">
        <h3 class="ext-group-label">${escapeHtml(group.label)}</h3>
        <div class="degoog-grid">${group.items.map(_card).join("")}</div>
      </section>`,
    )
    .join("");
};

export const searxShellHtml = (): string => `
  <input type="text" class="store-search-input degoog-search-bar degoog-search-bar--square-advanced" id="searx-search-input" placeholder="${escapeHtml(t("settings-page.extensions.searx-search"))}" autocomplete="off">
  <div class="ext-modal-status searx-status" id="searx-status" role="status"></div>
  <div id="searx-list"></div>`;
