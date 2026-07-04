import { escapeHtml } from "../../utils/dom";
import { screenshotUrl } from "./lightbox";
import type { RepoInfo, StoreItem } from "../../types/store-tab";
import { getBase } from "../../utils/base-url";
import { renderMdInline } from "../../utils/md";
import { bindingParts } from "../../shortcuts/binding";

const t = window.scopedT("core");

const OFFICIAL_REPO_URL =
  "https://github.com/degoog-org/official-extensions.git";

export function normalizeRepoUrl(url: string): string {
  const normUrl = (url || "").trim();
  return normUrl.endsWith(".git")
    ? normUrl
    : normUrl + (normUrl.includes("?") || normUrl.includes("#") ? "" : ".git");
}

export function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
    return `${Math.floor(s / 86400)} days ago`;
  } catch {
    return "";
  }
}

export function repoImageSrc(repo: RepoInfo): string {
  const img = repo.repoImage;
  if (!img) return "";
  if (/^https?:\/\//i.test(img)) return img;
  return `${getBase()}/api/store/repos/${encodeURIComponent(repo.localPath)}/asset?path=${encodeURIComponent(img)}`;
}

export function pluginTypeLabel(type: string): string {
  if (type === "command") return "Bang";
  if (type === "slot") return "Slot";
  if (type === "search-result-tab") return "Search tab";
  if (type === "searchBarAction") return "Search bar";
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, " ");
}

export function engineTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function renderRepoDetail(
  repo: RepoInfo,
  statusByUrl: Record<string, number>,
): string {
  const err = repo.error
    ? `<span class="store-repo-error">${escapeHtml(repo.error)}</span>`
    : "";
  const isOfficial =
    normalizeRepoUrl(repo.url) === normalizeRepoUrl(OFFICIAL_REPO_URL);
  const removeBtn = isOfficial
    ? ""
    : `<button class="btn btn--danger degoog-btn degoog-btn--danger store-btn-remove" type="button" data-url="${escapeHtml(repo.url)}">Remove</button>`;
  const normUrl = normalizeRepoUrl(repo.url);
  const behind = statusByUrl[normUrl] ?? statusByUrl[repo.url] ?? 0;
  const updatesNote =
    behind > 0
      ? `<span class="store-repo-updates-note" title="Refresh to get latest">${escapeHtml(String(behind))} update${behind !== 1 ? "s" : ""} available</span>`
      : "";
  const imgSrc = repoImageSrc(repo);
  const imgHtml = imgSrc
    ? `<img src="${escapeHtml(imgSrc)}" alt="" class="store-repo-img" loading="lazy">`
    : '<div class="store-repo-img store-repo-img-placeholder"></div>';
  return `
    <div class="store-repo-detail" data-url="${escapeHtml(repo.url)}">
      <div class="store-repo-detail-media">${imgHtml}</div>
      <div class="store-repo-detail-body">
        <div class="store-repo-name">${escapeHtml(repo.name || repo.url)}</div>
        <a href="${escapeHtml(repo.url.replace(/\.git$/, ""))}" target="_blank" rel="noopener" class="store-repo-url">${escapeHtml(repo.url)}</a>
        <div class="store-repo-meta">
          ${escapeHtml(formatRelativeTime(repo.lastFetched))}
          ${err}
          ${updatesNote}
        </div>
        <div class="store-repo-actions">
          <button class="btn degoog-btn store-btn-refresh" type="button" data-url="${escapeHtml(repo.url)}">Refresh</button>
          ${removeBtn}
        </div>
      </div>
    </div>`;
}

export function renderRepoList(
  repos: RepoInfo[],
  statusByUrl: Record<string, number>,
  selectedUrl: string | null,
): string {
  if (!repos.length) {
    return '<p class="store-empty">No repositories added. Add a git repository URL to browse its plugins, themes, engines, transports and shortcuts.</p>';
  }
  const selected = selectedUrl
    ? repos.find((r) => r.url === selectedUrl)
    : null;
  let html = "";
  html += '<div class="store-repo-list">';
  for (const repo of repos) {
    const imgSrc = repoImageSrc(repo);
    const active = repo.url === selectedUrl ? " store-repo-item--active" : "";
    const normUrl = normalizeRepoUrl(repo.url);
    const behind = statusByUrl[normUrl] ?? statusByUrl[repo.url] ?? 0;
    const dot = behind > 0 ? '<span class="store-repo-update-dot"></span>' : "";
    const imgHtml = imgSrc
      ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(repo.name || "")}" class="store-repo-img" loading="lazy">`
      : '<div class="store-repo-img store-repo-img-placeholder"></div>';
    html += `
      <div class="store-repo-item${active}" data-url="${escapeHtml(repo.url)}" role="button" tabindex="0" title="${escapeHtml(repo.name || repo.url)}">
        <div class="store-repo-item-media">${imgHtml}${dot}</div>
      </div>`;
  }
  html += "</div>";
  if (selected) {
    html += renderRepoDetail(selected, statusByUrl);
  }
  return html;
}

export function renderShortcutKeycaps(item: StoreItem): string {
  if (!item.shortcutBinding) return "";
  const caps = bindingParts(
    item.shortcutBinding,
    item.shortcutKind ?? "single",
  );
  if (!caps.length) return "";
  const keys = caps
    .map((cap) => `<kbd class="store-keycap">${escapeHtml(cap)}</kbd>`)
    .join('<span class="store-keycap-plus">+</span>');
  return `<div class="store-card-thumb store-card-keycaps">${keys}</div>`;
}

export function renderItemCard(item: StoreItem): string {
  const itemSlug = item.path.split("/").pop() ?? "";
  const firstUrl = item.screenshots.length
    ? screenshotUrl(item.repoSlug, item.type, itemSlug, item.screenshots[0])
    : "";
  const keycaps = item.type === "shortcut" ? renderShortcutKeycaps(item) : "";
  const thumb = item.screenshots.length
    ? `<img src="${firstUrl}" alt="" class="store-card-thumb" loading="lazy">`
    : keycaps ||
      `<div class="store-card-thumb store-card-thumb-placeholder"></div>`;
  const hasScreenshots = item.screenshots.length > 0;
  const clickableClass = hasScreenshots
    ? " store-card-thumb-wrap--clickable"
    : "";
  const screenshotsData = hasScreenshots
    ? ` data-screenshot-files="${escapeHtml(item.screenshots.join(","))}" data-repo-slug="${escapeHtml(item.repoSlug)}" data-item-type="${escapeHtml(item.type)}" data-item-slug="${escapeHtml(itemSlug)}" data-first-screenshot-url="${escapeHtml(firstUrl)}"`
    : "";
  const thumbA11y = hasScreenshots
    ? ' role="button" tabindex="0" aria-label="View screenshots"'
    : "";
  const author = item.author
    ? item.author.url
      ? `<a href="${escapeHtml(item.author.url)}" target="_blank" rel="noopener">${escapeHtml(item.author.name)}</a>`
      : escapeHtml(item.author.name)
    : "";

  let typeLabel = "";
  let subLabel = "";
  if (item.type === "plugin") {
    typeLabel = "Plugin";
    subLabel = item.pluginType ? pluginTypeLabel(item.pluginType) : "";
  } else if (item.type === "engine") {
    typeLabel = "Engine";
    subLabel = item.engineType ? engineTypeLabel(item.engineType) : "";
  } else if (item.type === "transport") {
    typeLabel = "Transport";
  } else if (item.type === "autocomplete") {
    typeLabel = "Autocomplete";
  } else if (item.type === "shortcut") {
    typeLabel = "Shortcut";
  } else {
    typeLabel = "Theme";
  }

  const dataAttrs = `data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}"`;
  const deleteBtnAttrs = item.untracked
    ? `data-untracked="true" data-folder-name="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}"`
    : dataAttrs;
  const btn = item.orphaned
    ? `<span class="ext-configured-badge"></span><button class="btn btn--danger degoog-btn degoog-btn--danger store-btn-delete" type="button" ${deleteBtnAttrs}>Delete</button>`
    : item.installed
      ? item.updateAvailable
        ? `<span class="ext-configured-badge"></span><button class="btn btn--primary degoog-btn degoog-btn--primary store-btn-update" type="button" ${dataAttrs}>Update</button><button class="btn btn--secondary degoog-btn degoog-btn--secondary store-btn-uninstall" type="button" ${dataAttrs}>Uninstall</button>`
        : `<span class="ext-configured-badge"></span><button class="btn btn--secondary degoog-btn degoog-btn--secondary store-btn-uninstall" type="button" ${dataAttrs}>Uninstall</button>`
      : `<button class="btn btn--primary degoog-btn degoog-btn--primary store-btn-install" type="button" ${dataAttrs}>Install</button>`;
  return `
    <div class="store-card" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}" data-plugin-type="${escapeHtml(item.pluginType || "")}" data-engine-type="${escapeHtml(item.engineType || "")}">
      <div class="store-card-thumb-wrap${clickableClass}"${screenshotsData}${thumbA11y}>${thumb}</div>
      <div class="store-card-body">
        <div class="store-card-main">
          <div class="store-card-name">${escapeHtml(item.name)}</div>
          <div class="store-card-meta">by ${author || "-"} · ${escapeHtml(item.repoName)}</div>
          <div class="store-card-desc">${renderMdInline(item.description || "")}</div>
          ${item.requiresNewerVersion ? `<div class="store-card-version-warning">${escapeHtml(t("settings-page.extensions.requires-newer-version"))}</div>` : ""}
        </div>
        <div class="store-card-footer">
          <div class="store-card-footer-main">
            <div class="store-card-version">${item.updateAvailable ? `<span class="store-card-version-old">v${escapeHtml(item.installedVersion || "?")}</span> → ` : ""}v${escapeHtml(item.version)}</div>

            <div class="store-card-footer-meta">
              <span class="store-type-badge store-type-${item.type} degoog-badge degoog-badge--store-type">${typeLabel}</span>
              ${subLabel ? `<span class="store-subtype-badge degoog-badge">${escapeHtml(subLabel)}</span>` : ""}
            </div>
          </div>

          <div class="store-card-actions">${btn}</div>
        </div>
      </div>
    </div>`;
}

export function filterItems(
  items: StoreItem[],
  typeFilter: string,
  subtypeFilter: string,
  searchQuery: string,
  repoFilter: string | null,
  installedFilter: string,
): StoreItem[] {
  let out = items;
  if (repoFilter) {
    const norm = normalizeRepoUrl(repoFilter);
    out = out.filter((i) => normalizeRepoUrl(i.repoUrl) === norm);
  }
  if (typeFilter && typeFilter !== "all") {
    out = out.filter((i) => i.type === typeFilter);
  }
  if (subtypeFilter && subtypeFilter !== "all") {
    out = out.filter((i) => {
      if (i.type === "plugin") return i.pluginType === subtypeFilter;
      if (i.type === "engine") {
        const types = i.engineTypes ?? (i.engineType ? [i.engineType] : []);
        return types.includes(subtypeFilter);
      }
      return true;
    });
  }
  if (installedFilter === "installed") {
    out = out.filter((i) => i.installed);
  } else if (installedFilter === "not-installed") {
    out = out.filter((i) => !i.installed);
  }
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    out = out.filter(
      (i) =>
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.repoName && i.repoName.toLowerCase().includes(q)) ||
        (i.author?.name && i.author.name.toLowerCase().includes(q)),
    );
  }
  return out;
}

export function collectSubtypes(
  items: StoreItem[],
  typeFilter: string,
): string[] {
  if (typeFilter === "plugin") {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.type === "plugin" && i.pluginType) set.add(i.pluginType);
    });
    return Array.from(set).sort();
  }
  if (typeFilter === "engine") {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.type !== "engine") return;
      for (const engineType of i.engineTypes ??
        (i.engineType ? [i.engineType] : [])) {
        set.add(engineType);
      }
    });
    return Array.from(set).sort();
  }
  return [];
}
