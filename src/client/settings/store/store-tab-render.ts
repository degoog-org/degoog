import { escapeHtml } from "../../utils/dom";
import { screenshotUrl } from "../store-lightbox";
import type { RepoInfo, StoreItem } from "../../types/store-tab";
import { getBase } from "../../utils/base-url";

const OFFICIAL_REPO_URL =
  "https://github.com/degoog-org/official-extensions.git";

export function normalizeRepoUrl(url: string): string {
  const t = (url || "").trim();
  return t.endsWith(".git")
    ? t
    : t + (t.includes("?") || t.includes("#") ? "" : ".git");
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

export function repoImageSrc(
  repo: RepoInfo,
  getToken: () => string | null,
): string {
  const img = repo.repoImage;
  if (!img) return "";
  if (/^https?:\/\//i.test(img)) return img;
  const token = getToken();
  const q = token ? `&token=${encodeURIComponent(token)}` : "";
  return `${getBase()}/api/store/repos/${encodeURIComponent(repo.localPath)}/asset?path=${encodeURIComponent(img)}${q}`;
}

export function pluginTypeLabel(t: string): string {
  if (t === "command") return "Bang";
  if (t === "slot") return "Slot";
  if (t === "search-result-tab") return "Search tab";
  if (t === "searchBarAction") return "Search bar";
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, " ");
}

export function engineTypeLabel(t: string): string {
  if (t === "web") return "Web";
  if (t === "images") return "Images";
  if (t === "videos") return "Videos";
  if (t === "news") return "News";

  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function renderRepoDetail(
  repo: RepoInfo,
  getToken: () => string | null,
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
  const imgSrc = repoImageSrc(repo, getToken);
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
  getToken: () => string | null,
  statusByUrl: Record<string, number>,
  selectedUrl: string | null,
): string {
  if (!repos.length) {
    return '<p class="store-empty">No repositories added. Add a git repository URL to browse its plugins, themes, engines, and transports.</p>';
  }
  const selected = selectedUrl
    ? repos.find((r) => r.url === selectedUrl)
    : null;
  let html = "";
  html += '<div class="store-repo-list">';
  for (const repo of repos) {
    const imgSrc = repoImageSrc(repo, getToken);
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
    html += renderRepoDetail(selected, getToken, statusByUrl);
  }
  return html;
}

export function renderItemCard(
  item: StoreItem,
  getToken: () => string | null,
): string {
  const itemSlug = item.path.split("/").pop() ?? "";
  const token = getToken();
  const firstUrl = item.screenshots.length
    ? screenshotUrl(
        item.repoSlug,
        item.type,
        itemSlug,
        item.screenshots[0],
        token,
      )
    : "";
  const thumb = item.screenshots.length
    ? `<img src="${firstUrl}" alt="" class="store-card-thumb" loading="lazy">`
    : `<div class="store-card-thumb store-card-thumb-placeholder"></div>`;
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
  } else {
    typeLabel = "Theme";
  }

  const btn = item.installed
    ? item.updateAvailable
      ? `<span class="ext-configured-badge"></span><button class="btn btn--primary degoog-btn degoog-btn--primary store-btn-update" type="button" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">Update</button><button class="btn btn--secondary degoog-btn degoog-btn--secondary store-btn-uninstall" type="button" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">Uninstall</button>`
      : `<span class="ext-configured-badge"></span><button class="btn btn--secondary degoog-btn degoog-btn--secondary store-btn-uninstall" type="button" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">Uninstall</button>`
    : `<button class="btn btn--primary degoog-btn degoog-btn--primary store-btn-install" type="button" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">Install</button>`;
  return `
    <div class="store-card" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}" data-plugin-type="${escapeHtml(item.pluginType || "")}" data-engine-type="${escapeHtml(item.engineType || "")}">
      <div class="store-card-thumb-wrap${clickableClass}"${screenshotsData}${thumbA11y}>${thumb}</div>
      <div class="store-card-body">
        <div class="store-card-main">
          <div class="store-card-name">${escapeHtml(item.name)}</div>
          <div class="store-card-meta">by ${author || "-"} · ${escapeHtml(item.repoName)}</div>
          <div class="store-card-desc">${escapeHtml(item.description || "")}</div>
          <div class="store-card-version">${item.updateAvailable ? `<span class="store-card-version-old">v${escapeHtml(item.installedVersion || "?")}</span> → ` : ""}v${escapeHtml(item.version)}</div>
          ${item.requiresNewerVersion ? `<div class="store-card-version-warning">Requires a newer version of Degoog</div>` : ""}
        </div>
        <div class="store-card-footer">
          <span class="store-type-badge store-type-${item.type} degoog-badge degoog-badge--store-type">${typeLabel}</span>
          ${subLabel ? `<span class="store-subtype-badge degoog-badge">${escapeHtml(subLabel)}</span>` : ""}
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
      if (i.type === "engine") return i.engineType === subtypeFilter;
      return true;
    });
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
      if (i.type === "engine" && i.engineType) set.add(i.engineType);
    });
    return Array.from(set).sort();
  }
  return [];
}
