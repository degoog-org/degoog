import { escapeHtml } from "../utils/dom";
import { jsonHeaders, authHeaders } from "../utils/request";
import { confirmModal } from "../modules/modals/confirm-modal/confirm";
import { initLightbox, screenshotUrl } from "./store-lightbox";

const OFFICIAL_REPO_URL =
  "https://github.com/fccview/fccview-degoog-extensions.git";

interface RepoInfo {
  url: string;
  localPath: string;
  lastFetched: string;
  name: string;
  error?: string;
  repoImage?: string | null;
}

interface StoreItem {
  path: string;
  repoSlug: string;
  repoUrl: string;
  repoName: string;
  name: string;
  description?: string;
  version: string;
  type: "plugin" | "theme" | "engine";
  installed: boolean;
  installedVersion?: string;
  updateAvailable?: boolean;
  screenshots: string[];
  author?: { name: string; url?: string };
  pluginType?: string;
  engineType?: string;
}

const _normalizeRepoUrl = (url: string): string => {
  const t = (url || "").trim();
  return t.endsWith(".git")
    ? t
    : t + (t.includes("?") || t.includes("#") ? "" : ".git");
};

const _formatRelativeTime = (iso: string): string => {
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
};

function repoImageSrc(repo: RepoInfo, getToken: () => string | null): string {
  const img = repo.repoImage;
  if (!img) return "";
  if (/^https?:\/\//i.test(img)) return img;
  const token = getToken();
  const q = token ? `&token=${encodeURIComponent(token)}` : "";
  return `/api/store/repos/${encodeURIComponent(repo.localPath)}/asset?path=${encodeURIComponent(img)}${q}`;
}

function pluginTypeLabel(t: string): string {
  if (t === "command") return "Bang";
  if (t === "slot") return "Slot";
  if (t === "search-result-tab") return "Search tab";
  if (t === "searchBarAction") return "Search bar";
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, " ");
}

function engineTypeLabel(t: string): string {
  if (t === "web") return "Web";
  if (t === "images") return "Images";
  if (t === "videos") return "Videos";
  if (t === "news") return "News";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function storeItemTypeLabel(item: StoreItem): string {
  if (item.type === "plugin") return "Plugin";
  if (item.type === "theme") return "Theme";
  return "Engine";
}

function storeItemSubtypeLabel(item: StoreItem): string {
  if (item.type === "plugin" && item.pluginType) {
    return pluginTypeLabel(item.pluginType);
  }
  if (item.type === "engine" && item.engineType) {
    return engineTypeLabel(item.engineType);
  }
  return "";
}

function storeItemKey(item: StoreItem): string {
  return `${item.type}::${item.repoUrl}::${item.path}`;
}

function storeItemScreenshotUrls(
  item: StoreItem,
  getToken: () => string | null,
): string[] {
  const token = getToken();
  const itemSlug = item.path.split("/").pop() ?? "";
  return item.screenshots.map((shot) =>
    screenshotUrl(item.repoSlug, item.type, itemSlug, shot, token),
  );
}

function renderStoreItemActionButtons(item: StoreItem): string {
  return item.installed
    ? item.updateAvailable
      ? `<span class="ext-configured-badge"></span><button class="btn btn--primary store-btn-update" type="button" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">Update</button><button class="btn btn--secondary store-btn-uninstall" type="button" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">Uninstall</button>`
      : `<span class="ext-configured-badge"></span><button class="btn btn--secondary store-btn-uninstall" type="button" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">Uninstall</button>`
    : `<button class="btn btn--primary store-btn-install" type="button" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}">Install</button>`;
}

function renderStoreItemScreenshotMarkup(
  urls: string[],
  itemName: string,
): string {
  if (!urls.length) {
    return "";
  }

  return `
    <div class="store-detail-gallery">
      ${urls
        .slice(0, 6)
        .map(
          (shot, index) => `
            <div class="store-detail-gallery-item">
              <img
                class="store-detail-gallery-img"
                src="${escapeHtml(shot)}"
                alt="${escapeHtml(itemName)} screenshot ${index + 1}"
                loading="lazy"
              >
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

const _renderRepoDetail = (
  repo: RepoInfo,
  getToken: () => string | null,
  statusByUrl: Record<string, number>,
): string => {
  const err = repo.error
    ? `<span class="store-repo-error">${escapeHtml(repo.error)}</span>`
    : "";
  const isOfficial =
    _normalizeRepoUrl(repo.url) === _normalizeRepoUrl(OFFICIAL_REPO_URL);
  const removeBtn = isOfficial
    ? ""
    : `<button class="btn btn--danger store-btn-remove" type="button" data-url="${escapeHtml(repo.url)}">Remove</button>`;
  const normUrl = _normalizeRepoUrl(repo.url);
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
          ${escapeHtml(_formatRelativeTime(repo.lastFetched))}
          ${err}
          ${updatesNote}
        </div>
        <div class="store-repo-actions">
          <button class="btn store-btn-refresh" type="button" data-url="${escapeHtml(repo.url)}">Refresh</button>
          ${removeBtn}
        </div>
      </div>
    </div>`;
};

const _renderRepoList = (
  repos: RepoInfo[],
  getToken: () => string | null,
  statusByUrl: Record<string, number>,
  selectedUrl: string | null,
): string => {
  if (!repos.length) {
    return '<p class="store-empty">No repositories added. Add a git repository URL to browse its plugins, themes, and engines.</p>';
  }
  const selected = selectedUrl
    ? repos.find((r) => r.url === selectedUrl)
    : null;
  let html = "";
  html += '<div class="store-repo-list">';
  for (const repo of repos) {
    const imgSrc = repoImageSrc(repo, getToken);
    const active = repo.url === selectedUrl ? " store-repo-item--active" : "";
    const normUrl = _normalizeRepoUrl(repo.url);
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
    html += _renderRepoDetail(selected, getToken, statusByUrl);
  }
  return html;
};

const _renderItemCard = (
  item: StoreItem,
  getToken: () => string | null,
): string => {
  const itemSlug = item.path.split("/").pop() ?? "";
  const detailKey = storeItemKey(item);
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
  const typeLabel = storeItemTypeLabel(item);
  const subLabel = storeItemSubtypeLabel(item);
  const btn = renderStoreItemActionButtons(item);
  return `
    <div class="store-card" data-detail-key="${escapeHtml(detailKey)}" data-repo-url="${escapeHtml(item.repoUrl)}" data-item-path="${escapeHtml(item.path)}" data-type="${escapeHtml(item.type)}" data-plugin-type="${escapeHtml(item.pluginType || "")}" data-engine-type="${escapeHtml(item.engineType || "")}">
      <div class="store-card-thumb-wrap${clickableClass}"${screenshotsData}${thumbA11y}>${thumb}</div>
      <div class="store-card-body">
        <div class="store-card-main" data-detail-key="${escapeHtml(detailKey)}" role="button" tabindex="0" aria-label="View details for ${escapeHtml(item.name)}">
          <button class="store-card-name-button" type="button" data-detail-key="${escapeHtml(detailKey)}">${escapeHtml(item.name)}</button>
          <div class="store-card-meta">by ${author || "—"} · ${escapeHtml(item.repoName)}</div>
          <div class="store-card-desc">${escapeHtml(item.description || "")}</div>
          <div class="store-card-version">${item.updateAvailable ? `<span class="store-card-version-old">v${escapeHtml(item.installedVersion || "?")}</span> → ` : ""}v${escapeHtml(item.version)}</div>
        </div>
        <div class="store-card-footer">
          <span class="store-type-badge store-type-${item.type}">${typeLabel}</span>
          ${subLabel ? `<span class="store-subtype-badge">${escapeHtml(subLabel)}</span>` : ""}
          <div class="store-card-actions">${btn}</div>
        </div>
      </div>
    </div>`;
};

const _filterItems = (
  items: StoreItem[],
  typeFilter: string,
  subtypeFilter: string,
  searchQuery: string,
): StoreItem[] => {
  let out = items;
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
};

function collectSubtypes(items: StoreItem[], typeFilter: string): string[] {
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

export async function initStoreTab(
  container: HTMLElement,
  getToken: () => string | null,
): Promise<void> {
  if (!container) return;

  let repos: RepoInfo[] = [];
  let items: StoreItem[] = [];
  let repoStatusByUrl: Record<string, number> = {};
  let selectedRepoUrl: string | null = null;
  let typeFilter = "all";
  let subtypeFilter = "all";
  let searchQuery = "";
  let activeDetailKey: string | null = null;
  let detailBodyScrollTop = "";

  function getActiveDetailItem(): StoreItem | null {
    if (!activeDetailKey) return null;
    return items.find((item) => storeItemKey(item) === activeDetailKey) ?? null;
  }

  function lockBodyScroll(): void {
    if (!detailBodyScrollTop) {
      detailBodyScrollTop = document.body.style.overflow || "";
    }
    document.body.style.overflow = "hidden";
  }

  function unlockBodyScroll(): void {
    document.body.style.overflow = detailBodyScrollTop;
    detailBodyScrollTop = "";
  }

  function buildStoreDetailHtml(item: StoreItem): string {
    const detailKey = storeItemKey(item);
    const itemSlug = item.path.split("/").pop() ?? "";
    const typeLabel = storeItemTypeLabel(item);
    const subLabel = storeItemSubtypeLabel(item);
    const heroUrls = storeItemScreenshotUrls(item, getToken);
    const hasHeroImage = heroUrls.length > 0;
    const heroHtml = hasHeroImage
      ? `<img class="store-detail-hero-img" src="${escapeHtml(heroUrls[0])}" alt="${escapeHtml(item.name)}">`
      : `<div class="store-detail-hero-placeholder"><span class="store-detail-hero-placeholder-kicker">${escapeHtml(typeLabel)}</span><span class="store-detail-hero-placeholder-title">${escapeHtml(item.repoName)}</span></div>`;
    const author = item.author
      ? item.author.url
        ? `<a href="${escapeHtml(item.author.url)}" target="_blank" rel="noopener">${escapeHtml(item.author.name)}</a>`
        : escapeHtml(item.author.name)
      : "—";
    const description = item.description?.trim()
      ? escapeHtml(item.description)
      : "No description provided.";
    const versionHtml = item.updateAvailable
      ? `<span class="store-detail-version-old">v${escapeHtml(item.installedVersion || "?")}</span> <span class="store-detail-version-arrow">→</span> <span class="store-detail-version-current">v${escapeHtml(item.version)}</span>`
      : `<span class="store-detail-version-current">v${escapeHtml(item.version)}</span>`;

    return `
      <div class="store-detail-panel" data-detail-key="${escapeHtml(detailKey)}">
        <div class="store-detail-hero ${hasHeroImage ? "store-detail-hero--image" : "store-detail-hero--placeholder"}">${heroHtml}</div>
        <div class="store-detail-copy">
          <div class="store-detail-heading-row">
            <div class="store-detail-heading-copy">
              <span class="store-detail-kicker">${escapeHtml(typeLabel)}${subLabel ? ` · ${escapeHtml(subLabel)}` : ""}</span>
              <h3 class="store-detail-title">${escapeHtml(item.name)}</h3>
              <div class="store-detail-meta">by ${author} · ${escapeHtml(item.repoName)}</div>
            </div>
            <div class="store-detail-version">${versionHtml}</div>
          </div>
          <div class="store-detail-description">${description}</div>
          <div class="store-detail-actions">${renderStoreItemActionButtons(item)}</div>
          <div class="store-detail-info-grid">
            <div class="store-detail-info-item">
              <span class="store-detail-info-label">Repository</span>
              <a href="${escapeHtml(item.repoUrl.replace(/\.git$/, ""))}" target="_blank" rel="noopener" class="store-detail-info-value">${escapeHtml(item.repoName)}</a>
            </div>
            <div class="store-detail-info-item">
              <span class="store-detail-info-label">Type</span>
              <span class="store-detail-info-value">${escapeHtml(typeLabel)}${subLabel ? ` · ${escapeHtml(subLabel)}` : ""}</span>
            </div>
            <div class="store-detail-info-item">
              <span class="store-detail-info-label">Path</span>
              <span class="store-detail-info-value">${escapeHtml(item.path)}</span>
            </div>
            <div class="store-detail-info-item">
              <span class="store-detail-info-label">Slug</span>
              <span class="store-detail-info-value">${escapeHtml(itemSlug)}</span>
            </div>
          </div>
          ${heroUrls.length ? `<div class="store-detail-gallery-wrap"><div class="store-detail-gallery-heading">Screenshots</div>${renderStoreItemScreenshotMarkup(heroUrls, item.name)}</div>` : ""}
        </div>
      </div>
    `;
  }

  function syncDetailModal(): void {
    const modal = container.querySelector<HTMLElement>(".store-detail-modal");
    const body = modal?.querySelector<HTMLElement>(".store-detail-body");
    if (!modal || !body) return;

    const item = getActiveDetailItem();
    if (!item) {
      modal.classList.remove("store-detail-modal--open");
      modal.setAttribute("aria-hidden", "true");
      unlockBodyScroll();
      body.innerHTML = "";
      return;
    }

    body.innerHTML = buildStoreDetailHtml(item);
    modal.classList.add("store-detail-modal--open");
    modal.setAttribute("aria-hidden", "false");
    lockBodyScroll();

    body
      .querySelectorAll<HTMLButtonElement>(".store-btn-install")
      .forEach((btn) => {
        btn.addEventListener("click", () => void handleInstall(btn));
      });
    body
      .querySelectorAll<HTMLButtonElement>(".store-btn-uninstall")
      .forEach((btn) => {
        btn.addEventListener("click", () => void handleUninstall(btn));
      });
    body
      .querySelectorAll<HTMLButtonElement>(".store-btn-update")
      .forEach((btn) => {
        btn.addEventListener("click", () => void handleUpdate(btn));
      });
    body
      .querySelectorAll<HTMLElement>(".store-detail-gallery-item")
      .forEach((galleryItem, index) => {
        galleryItem.addEventListener("click", () => {
          const screenshotUrls = storeItemScreenshotUrls(item, getToken);
          if (screenshotUrls.length === 0) return;
          openStoreScreenshotLightbox(screenshotUrls, index);
        });
      });
  }

  function openDetailForKey(detailKey: string): void {
    activeDetailKey = detailKey;
    syncDetailModal();
  }

  function closeDetail(): void {
    activeDetailKey = null;
    syncDetailModal();
  }

  function openStoreScreenshotLightbox(
    urls: string[],
    startIndex = 0,
  ): void {
    const lb = container.querySelector<HTMLElement>(".store-lightbox");
    const img = lb?.querySelector<HTMLImageElement>(".store-lightbox-img");
    const counter = lb?.querySelector<HTMLElement>(".store-lightbox-counter");
    const prevBtn = lb?.querySelector<HTMLButtonElement>(".store-lightbox-prev");
    const nextBtn = lb?.querySelector<HTMLButtonElement>(".store-lightbox-next");
    const closeBtn = lb?.querySelector<HTMLButtonElement>(".store-lightbox-close");
    const backdrop = lb?.querySelector<HTMLElement>(".store-lightbox-backdrop");
    if (
      !lb ||
      !img ||
      !counter ||
      !prevBtn ||
      !nextBtn ||
      !closeBtn ||
      !backdrop ||
      urls.length === 0
    ) {
      return;
    }

    let currentIndex = Math.max(0, Math.min(startIndex, urls.length - 1));

    const renderSlide = (): void => {
      img.src = urls[currentIndex] || "";
      counter.textContent =
        urls.length > 1 ? `${currentIndex + 1} / ${urls.length}` : "";
      prevBtn.style.visibility = urls.length > 1 ? "visible" : "hidden";
      nextBtn.style.visibility = urls.length > 1 ? "visible" : "hidden";
    };

    const closeLightbox = (): void => {
      lb.classList.remove("store-lightbox--open");
      lb.setAttribute("aria-hidden", "true");
      document.removeEventListener("keydown", onKey);
      closeBtn.onclick = null;
      backdrop.onclick = null;
      prevBtn.onclick = null;
      nextBtn.onclick = null;
    };

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeLightbox();
        return;
      }
      if (event.key === "ArrowLeft" && urls.length > 1) {
        currentIndex = (currentIndex - 1 + urls.length) % urls.length;
        renderSlide();
      }
      if (event.key === "ArrowRight" && urls.length > 1) {
        currentIndex = (currentIndex + 1) % urls.length;
        renderSlide();
      }
    };

    closeDetail();
    lb.classList.add("store-lightbox--open");
    lb.setAttribute("aria-hidden", "false");
    renderSlide();
    document.addEventListener("keydown", onKey);

    closeBtn.onclick = closeLightbox;
    backdrop.onclick = closeLightbox;
    prevBtn.onclick = () => {
      currentIndex = (currentIndex - 1 + urls.length) % urls.length;
      renderSlide();
    };
    nextBtn.onclick = () => {
      currentIndex = (currentIndex + 1) % urls.length;
      renderSlide();
    };
  }

  function bindStoreActionButtons(root: ParentNode): void {
    root
      .querySelectorAll<HTMLButtonElement>(".store-btn-install")
      .forEach((btn) => {
        btn.addEventListener("click", () => void handleInstall(btn));
      });
    root
      .querySelectorAll<HTMLButtonElement>(".store-btn-uninstall")
      .forEach((btn) => {
        btn.addEventListener("click", () => void handleUninstall(btn));
      });
    root
      .querySelectorAll<HTMLButtonElement>(".store-btn-update")
      .forEach((btn) => {
        btn.addEventListener("click", () => void handleUpdate(btn));
      });
  }

  async function loadRepos(): Promise<void> {
    const res = await fetch("/api/store/repos", {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { repos?: RepoInfo[] };
    repos = data.repos || [];
  }

  async function loadReposStatus(): Promise<void> {
    const res = await fetch("/api/store/repos/status", {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      statuses?: Array<{ url: string; behind: number }>;
    };
    const statuses = data.statuses || [];
    const map: Record<string, number> = {};
    for (const s of statuses) {
      map[_normalizeRepoUrl(s.url)] = s.behind;
      map[s.url] = s.behind;
    }
    repoStatusByUrl = map;
  }

  async function loadItems(): Promise<void> {
    const res = await fetch("/api/store/items", {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { items?: StoreItem[] };
    items = data.items || [];
  }

  async function refreshAndRender(): Promise<void> {
    await loadRepos();
    await loadItems();
    render();
  }

  function render(): void {
    const repoSection = container.querySelector<HTMLElement>(
      ".store-repos-section",
    );
    const listEl = repoSection?.querySelector<HTMLElement>(
      ".store-repo-list-wrap",
    );
    if (listEl) {
      listEl.innerHTML = _renderRepoList(repos, getToken, repoStatusByUrl, selectedRepoUrl);
      listEl
        .querySelectorAll<HTMLElement>(".store-repo-item")
        .forEach((el) => {
          el.addEventListener("click", () => {
            const url = el.dataset.url;
            if (!url) return;
            selectedRepoUrl = selectedRepoUrl === url ? null : url;
            render();
          });
        });
    }

    const catalogSection = container.querySelector<HTMLElement>(
      ".store-catalog-section",
    );
    const typeTabs =
      catalogSection?.querySelector<HTMLElement>(".store-type-tabs");
    const subtypeWrap = catalogSection?.querySelector<HTMLElement>(
      ".store-subtype-wrap",
    );
    const subtypeTabs = catalogSection?.querySelector<HTMLElement>(
      ".store-subtype-tabs",
    );
    const grid = catalogSection?.querySelector<HTMLElement>(
      ".store-catalog-grid",
    );

    if (typeTabs) {
      const typeCounts = {
        all: items.length,
        plugin: items.filter((i) => i.type === "plugin").length,
        theme: items.filter((i) => i.type === "theme").length,
        engine: items.filter((i) => i.type === "engine").length,
      };
      typeTabs.innerHTML = [
        { id: "all", label: "All", count: typeCounts.all },
        { id: "plugin", label: "Plugins", count: typeCounts.plugin },
        { id: "theme", label: "Themes", count: typeCounts.theme },
        { id: "engine", label: "Engines", count: typeCounts.engine },
      ]
        .map(
          (t) =>
            `<button class="btn store-type-tab ${typeFilter === t.id ? "active" : ""}" type="button" data-type="${escapeHtml(t.id)}">${escapeHtml(t.label)} <span class="store-tab-count">${t.count}</span></button>`,
        )
        .join("");
      typeTabs
        .querySelectorAll<HTMLButtonElement>(".store-type-tab")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            typeFilter = btn.dataset.type || "all";
            subtypeFilter = "all";
            render();
          });
        });
    }

    const subtypes = collectSubtypes(items, typeFilter);
    if (subtypeWrap) {
      if (subtypes.length === 0) {
        subtypeWrap.classList.add("store-subtype-wrap--hidden");
        if (subtypeTabs) subtypeTabs.innerHTML = "";
      } else {
        subtypeWrap.classList.remove("store-subtype-wrap--hidden");
        if (subtypeTabs) {
          const filteredForType = items.filter((i) => i.type === typeFilter);
          subtypeTabs.innerHTML = [
            { id: "all", label: "All", count: filteredForType.length },
            ...subtypes.map((id) => ({
              id,
              label:
                typeFilter === "plugin"
                  ? pluginTypeLabel(id)
                  : engineTypeLabel(id),
              count: filteredForType.filter(
                (i) =>
                  (typeFilter === "plugin" && i.pluginType === id) ||
                  (typeFilter === "engine" && i.engineType === id),
              ).length,
            })),
          ]
            .map(
              (t) =>
                `<button class="btn store-subtype-tab ${subtypeFilter === t.id ? "active" : ""}" type="button" data-subtype="${escapeHtml(t.id)}">${escapeHtml(t.label)} <span class="store-tab-count">${t.count}</span></button>`,
            )
            .join("");
          subtypeTabs
            .querySelectorAll<HTMLButtonElement>(".store-subtype-tab")
            .forEach((btn) => {
              btn.addEventListener("click", () => {
                subtypeFilter = btn.dataset.subtype || "all";
                render();
              });
            });
        }
      }
    }

    if (grid) {
      const filtered = _filterItems(
        items,
        typeFilter,
        subtypeFilter,
        searchQuery,
      );
      grid.innerHTML = filtered
        .map((item) => _renderItemCard(item, getToken))
        .join("");
      bindStoreActionButtons(grid);
    }

    syncDetailModal();

    const updateAllBtn = container.querySelector<HTMLButtonElement>(
      ".store-btn-update-all",
    );
    const updatableCount = items.filter((i) => i.updateAvailable).length;
    if (updateAllBtn) {
      if (updatableCount > 0) {
        updateAllBtn.style.display = "";
        updateAllBtn.textContent = `Update all (${updatableCount})`;
      } else {
        updateAllBtn.style.display = "none";
      }
    }
  }

  function showError(el: HTMLElement | null, msg: string): void {
    if (!el) return;
    el.textContent = msg;
    el.classList.add("store-error-visible");
    setTimeout(() => el.classList.remove("store-error-visible"), 4000);
  }

  async function handleAddRepo(
    inputEl: HTMLInputElement | null,
    addBtn: HTMLButtonElement,
    errorEl: HTMLElement | null,
  ): Promise<void> {
    const url = inputEl?.value?.trim();
    if (!url) return;
    addBtn.disabled = true;
    if (errorEl) errorEl.textContent = "";
    try {
      const res = await fetch("/api/store/repos", {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        showError(errorEl, data.error || "Failed to add repository");
        return;
      }
      if (inputEl) inputEl.value = "";
      await refreshAndRender();
    } catch {
      showError(errorEl, "Network error");
    } finally {
      addBtn.disabled = false;
    }
  }

  async function handleRefresh(url: string): Promise<void> {
    const res = await fetch("/api/store/repos/refresh", {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return;
    await refreshAndRender();
    void loadReposStatus().then(() => render());
  }

  async function handleRemove(url: string): Promise<void> {
    const fromRepo = repos.find((r) => r.url === url);
    if (!fromRepo) return;
    const res = await fetch("/api/store/repos", {
      method: "DELETE",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({ url }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      alert(data.error || "Failed to remove repository");
      return;
    }
    await refreshAndRender();
  }

  async function handleInstall(btn: HTMLButtonElement): Promise<void> {
    const { repoUrl, itemPath, type } = btn.dataset;
    if (
      type === "plugin" &&
      !(await confirmModal({
        title: "Install plugin?",
        message:
          "This plugin will run code on your server. Only install from sources you trust. Continue?",
      }))
    )
      return;
    btn.disabled = true;
    try {
      const res = await fetch("/api/store/install", {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({ repoUrl, itemPath, type }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) alert(data.error || "Install failed");
      else await loadItems().then(() => render());
    } catch {
      alert("Network error");
    } finally {
      btn.disabled = false;
    }
  }

  async function handleUninstall(btn: HTMLButtonElement): Promise<void> {
    const { repoUrl, itemPath, type } = btn.dataset;
    if (
      !(await confirmModal({
        title: "Uninstall?",
        message: `Uninstall this ${type ?? "item"}?`,
      }))
    )
      return;
    btn.disabled = true;
    try {
      const res = await fetch("/api/store/uninstall", {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({ repoUrl, itemPath, type }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) alert(data.error || "Uninstall failed");
      else await loadItems().then(() => render());
    } catch {
      alert("Network error");
    } finally {
      btn.disabled = false;
    }
  }

  async function handleUpdate(btn: HTMLButtonElement): Promise<void> {
    const { repoUrl, itemPath, type } = btn.dataset;
    btn.disabled = true;
    try {
      const res = await fetch("/api/store/update", {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({ repoUrl, itemPath, type }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) alert(data.error || "Update failed");
      else await loadItems().then(() => render());
    } catch {
      alert("Network error");
    } finally {
      btn.disabled = false;
    }
  }

  async function handleUpdateAll(): Promise<void> {
    const btn = container.querySelector<HTMLButtonElement>(
      ".store-btn-update-all",
    );
    if (btn) btn.disabled = true;
    try {
      const res = await fetch("/api/store/update-all", {
        method: "POST",
        headers: jsonHeaders(getToken),
      });
      const data = (await res.json()) as { error?: string; updated?: number };
      if (!res.ok) alert(data.error || "Update failed");
      else await loadItems().then(() => render());
    } catch {
      alert("Network error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  container.innerHTML = `
    <section class="store-repos-section settings-section">
      <div class="store-repos-header">
        <h2 class="settings-section-heading">Repositories</h2>
        <div class="header-actions">
          <div class="store-repos-actions">
            <button class="btn store-btn-refresh-all" type="button">Refresh all</button>
          </div>
          <button class="btn btn--primary store-btn-add" type="button">Add repository</button>
        </div>
      </div>
      <div class="store-add-repo-wrap" style="display:none">
        <input type="text" class="store-input-url" placeholder="https://github.com/user/repo.git">
        <button class="btn btn--primary store-btn-add-confirm" type="button">Add</button>
        <span class="store-inline-error"></span>
      </div>
      <p class="settings-desc">Add a git repository URL to browse and install plugins, themes, and engines. Set <code>repo-image</code> in the repo’s package.json to show an image next to the URL.</p>
      <div class="store-repo-list-wrap"></div>
    </section>
    <section class="store-catalog-section settings-section">
      <div class="store-catalog-header">
        <h2 class="settings-section-heading">Catalog</h2>
        <button class="btn btn--primary store-btn-update-all" type="button" style="display:none">Update all</button>
      </div>
      <div class="store-catalog-search-wrap">
        <input type="text" class="store-search-input" placeholder="Search name, description, repo, author…" id="store-search-input">
      </div>
      <div class="store-type-tabs" role="tablist"></div>
      <div class="store-subtype-wrap store-subtype-wrap--hidden">
        <div class="store-subtype-tabs" role="tablist"></div>
      </div>
      <div class="store-catalog-grid"></div>
    </section>
    <div class="store-detail-modal" id="store-detail-modal" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Catalog item details">
      <div class="store-detail-backdrop"></div>
      <div class="store-detail-dialog" role="document">
        <button class="store-detail-close" type="button" aria-label="Close">&times;</button>
        <div class="store-detail-body"></div>
      </div>
    </div>
    <div class="store-lightbox" id="store-lightbox" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Screenshot gallery">
      <div class="store-lightbox-backdrop"></div>
      <button class="store-lightbox-close" type="button" aria-label="Close">&times;</button>
      <button class="store-lightbox-prev" type="button" aria-label="Previous">&larr;</button>
      <div class="store-lightbox-img-wrap">
        <img class="store-lightbox-img" src="" alt="">
      </div>
      <button class="store-lightbox-next" type="button" aria-label="Next">&rarr;</button>
      <div class="store-lightbox-counter"></div>
    </div>`;

  initLightbox(container, getToken);

  const addWrap = container.querySelector<HTMLElement>(".store-add-repo-wrap");
  const addBtn = container.querySelector<HTMLButtonElement>(".store-btn-add");
  const addConfirmBtn = container.querySelector<HTMLButtonElement>(
    ".store-btn-add-confirm",
  );
  const urlInput =
    container.querySelector<HTMLInputElement>(".store-input-url");
  const addErrorEl = container.querySelector<HTMLElement>(
    ".store-inline-error",
  );

  addBtn?.addEventListener("click", () => {
    if (addWrap)
      addWrap.style.display =
        addWrap.style.display === "none" ? "block" : "none";
  });
  addConfirmBtn?.addEventListener("click", () => {
    if (addConfirmBtn) void handleAddRepo(urlInput, addConfirmBtn, addErrorEl);
  });

  container
    .querySelector<HTMLButtonElement>(".store-btn-refresh-all")
    ?.addEventListener("click", async () => {
      const btn = container.querySelector<HTMLButtonElement>(
        ".store-btn-refresh-all",
      );
      if (btn) btn.disabled = true;
      try {
        await fetch("/api/store/repos/refresh", {
          method: "POST",
          headers: jsonHeaders(getToken),
          body: JSON.stringify({}),
        });
        await refreshAndRender();
        void loadReposStatus().then(() => render());
      } finally {
        if (btn) btn.disabled = false;
      }
    });

  container.addEventListener("click", async (e) => {
    const detailClose = (e.target as HTMLElement).closest<HTMLElement>(
      ".store-detail-close, .store-detail-backdrop",
    );
    if (detailClose) {
      closeDetail();
      return;
    }

    const detailCard = (e.target as HTMLElement).closest<HTMLElement>(
      ".store-card-main[data-detail-key], .store-card-name-button[data-detail-key]",
    );
    if (detailCard?.dataset.detailKey) {
      openDetailForKey(detailCard.dataset.detailKey);
      return;
    }

    const refreshBtn = (e.target as HTMLElement).closest<HTMLElement>(
      ".store-btn-refresh",
    );
    const removeBtn = (e.target as HTMLElement).closest<HTMLElement>(
      ".store-btn-remove",
    );
    if (refreshBtn?.dataset.url) void handleRefresh(refreshBtn.dataset.url);
    if (removeBtn?.dataset.url) {
      const ok = await confirmModal({
        title: "Remove repository?",
        message:
          "Remove this repository? You must uninstall any installed items first.",
      });
      if (ok) void handleRemove(removeBtn.dataset.url);
    }
  });

  container.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (e.key === "Escape" && activeDetailKey) {
      closeDetail();
      return;
    }

    if (e.key !== "Enter" && e.key !== " ") return;
    const detailCard = target.closest<HTMLElement>(
      ".store-card-main[data-detail-key]",
    );
    if (!detailCard?.dataset.detailKey) return;
    e.preventDefault();
    openDetailForKey(detailCard.dataset.detailKey);
  });

  container
    .querySelector<HTMLButtonElement>(".store-btn-update-all")
    ?.addEventListener("click", () => void handleUpdateAll());

  const searchInput = container.querySelector<HTMLInputElement>(
    "#store-search-input",
  );
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput?.value || "";
    render();
  });

  try {
    await refreshAndRender();
    void (async () => {
      await fetch("/api/store/repos/refresh", {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({}),
      }).catch(() => { });
      await loadRepos();
      await loadItems();
      await loadReposStatus();
      render();
    })();
  } catch {
    const wrap = container.querySelector<HTMLElement>(".store-repo-list-wrap");
    if (wrap)
      wrap.innerHTML = '<p class="store-empty">Failed to load store.</p>';
  }
}
