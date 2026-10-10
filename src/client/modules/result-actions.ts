import { cleanUrl } from "../utils/dom/dom";
import { getBase } from "../utils/net/base-url";
import { swapFavicon } from "../utils/dom/favicon";
import { applyRedirect, checkRedirectRule } from "../../shared/redirects/redirect-rules";
import { toBareHost } from "../../shared/redirects/redirect-match";
import { confirmModal } from "./modals/confirm-modal/confirm";
import { promptModal } from "./modals/prompt-modal/prompt";

const TOKEN_KEY = "degoog-settings-token";
const TOGGLE_PREFIX = "result-actions-toggle-";
const MENU_PREFIX = "result-actions-menu-";
const ACTIONS_PREFIX = "result-actions-";
const ACTION_BLOCK_PREFIX = "result-action-block-";
const ACTION_REPLACE_PREFIX = "result-action-replace-";
const ACTION_SCORE_PREFIX = "result-action-score-";
const ACTION_REFRESH_PREFIX = "result-action-refresh-";
const DOMAIN_ACTION_PATH = "/api/settings/domain-action";
const FAVICON_REFRESH_PATH = "/api/favicon/refresh";

type DomainActionKind = "block" | "replace" | "score";
type ResultActionKind = DomainActionKind | "refresh";

const ACTION_PREFIXES: ReadonlyArray<[string, ResultActionKind]> = [
  [ACTION_BLOCK_PREFIX, "block"],
  [ACTION_REPLACE_PREFIX, "replace"],
  [ACTION_SCORE_PREFIX, "score"],
  [ACTION_REFRESH_PREFIX, "refresh"],
];

const t = window.scopedT("themes/degoog");

const _getToken = (): string | null => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const _idIndex = (prefix: string, id: string): string | null => {
  if (!id.startsWith(prefix)) return null;
  return id.slice(prefix.length);
};

const _findResultItem = (el: HTMLElement): HTMLElement | null =>
  el.closest<HTMLElement>(".result-item");

function _closeAllMenus(except?: HTMLElement | null): void {
  document
    .querySelectorAll<HTMLElement>('[id^="result-actions-menu-"]')
    .forEach((menu) => {
      if (menu === except) return;
      menu.hidden = true;
    });
  document
    .querySelectorAll<HTMLButtonElement>('[id^="result-actions-toggle-"]')
    .forEach((btn) => btn.setAttribute("aria-expanded", "false"));
}

function _showToast(anchor: HTMLElement, message: string): void {
  const existing = anchor.querySelector(".result-actions-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "result-actions-toast";
  toast.textContent = message;
  anchor.appendChild(toast);
  setTimeout(() => toast.remove(), 1700);
}

const _post = async (path: string, body: object): Promise<Response | null> => {
  const token = _getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["x-settings-token"] = token;
  try {
    return await fetch(`${getBase()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch (err) {
    console.debug(`[result-actions] ${path} request failed`, err);
    return null;
  }
};

const _readJson = async (res: Response): Promise<Record<string, unknown>> => {
  try {
    const data: unknown = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch (err) {
    console.debug("[result-actions] unreadable response body", err);
    return {};
  }
};

const _stringField = (data: Record<string, unknown>, key: string): string => {
  const value = data[key];
  return typeof value === "string" ? value : "";
};

const _postAction = async (body: {
  kind: DomainActionKind;
  source: string;
  target?: string;
  score?: number;
}): Promise<Response | null> => {
  const res = await _post(DOMAIN_ACTION_PATH, body);
  return res?.ok ? res : null;
};

const _refreshFavicon = async (host: string): Promise<string | null> => {
  const res = await _post(FAVICON_REFRESH_PATH, { domain: host });
  if (!res?.ok) return null;
  return _stringField(await _readJson(res), "url") || null;
};

function _swapFaviconsForHost(host: string, src: string): void {
  document
    .querySelectorAll<HTMLElement>("#results-list .result-favicon")
    .forEach((el) => {
      if (el.dataset.faviconHost === host) swapFavicon(el, host, src);
    });
}

function _removeRowsForHost(host: string): void {
  document.querySelectorAll<HTMLElement>(".result-item").forEach((row) => {
    const wrap = row.querySelector<HTMLElement>('[id^="result-actions-"]');
    const rowHost = wrap?.dataset.host;
    if (!rowHost) return;
    if (rowHost === host || rowHost.endsWith(`.${host}`)) row.remove();
  });
}

function _applyReplaceToRow(
  row: HTMLElement,
  source: string,
  target: string,
  faviconSrc: string,
): void {
  const link = row.querySelector<HTMLAnchorElement>(".result-title");
  const cite = row.querySelector<HTMLElement>(".result-cite");
  const favicon = row.querySelector<HTMLElement>(".result-favicon");
  const wrap = row.querySelector<HTMLElement>('[id^="result-actions-"]');
  if (!link) return;
  try {
    const check = checkRedirectRule({ match: source, replace: toBareHost(target) });
    const replaced = check.ok ? applyRedirect(link.href, [check.compiled])?.url : null;
    if (!replaced) {
      console.debug("[result-actions] unusable replace target", target);
      return;
    }
    const host = new URL(replaced).hostname;
    link.href = replaced;
    if (cite) cite.textContent = cleanUrl(replaced);
    if (favicon) swapFavicon(favicon, host, faviconSrc);
    if (wrap) wrap.dataset.host = host;
  } catch (err) {
    console.debug("[result-actions] URL replace failed", err);
  }
}

const _handleClick = async (e: MouseEvent): Promise<void> => {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  const toggle = target.closest<HTMLElement>('[id^="result-actions-toggle-"]');
  if (toggle) {
    e.preventDefault();
    const idx = _idIndex(TOGGLE_PREFIX, toggle.id);
    if (!idx) return;
    const menu = document.getElementById(`${MENU_PREFIX}${idx}`);
    if (!menu) return;
    const willOpen = menu.hidden;
    _closeAllMenus(willOpen ? menu : null);
    menu.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
    return;
  }

  const item = target.closest<HTMLElement>('[id^="result-action-"]');
  if (!item) return;

  e.preventDefault();
  let kind: ResultActionKind | null = null;
  let idx: string | null = null;
  for (const [prefix, candidate] of ACTION_PREFIXES) {
    idx = _idIndex(prefix, item.id);
    if (idx) {
      kind = candidate;
      break;
    }
  }
  if (!kind || !idx) return;

  const wrap = document.getElementById(`${ACTIONS_PREFIX}${idx}`);
  const host = wrap?.dataset.host ?? "";
  const row = wrap ? _findResultItem(wrap) : null;
  if (!host || !row || !wrap) {
    _closeAllMenus();
    return;
  }

  _closeAllMenus();

  if (kind === "block") {
    const confirmed = await confirmModal({
      title: t("search-templates.result.actions.block-confirm-title"),
      message: `${host} - ${t("search-templates.result.actions.block-confirm-message")}`,
    });
    if (!confirmed) return;
    const res = await _postAction({ kind, source: host });
    if (res) _removeRowsForHost(host);
    return;
  }

  if (kind === "replace") {
    const replacement = await promptModal({
      title: t("search-templates.result.actions.prompt-target-title"),
      description: t("search-templates.result.actions.prompt-target"),
      placeholder: "example.com",
    });
    if (!replacement) return;
    const res = await _postAction({ kind, source: host, target: replacement });
    if (!res) return;
    const data = await _readJson(res);
    _applyReplaceToRow(row, host, replacement, _stringField(data, "favicon"));
    return;
  }

  if (kind === "score") {
    const raw = await promptModal({
      title: t("search-templates.result.actions.prompt-score-title"),
      description: t("search-templates.result.actions.prompt-score"),
      defaultValue: "10",
      type: "number",
    });
    if (raw === null) return;
    const score = Number(raw.trim());
    if (!Number.isFinite(score)) return;
    const res = await _postAction({ kind, source: host, score });
    if (res) _showToast(wrap, t("search-templates.result.actions.scored"));
    return;
  }

  const refreshed = await _refreshFavicon(host);
  if (refreshed) _swapFaviconsForHost(host, refreshed);
  _showToast(
    wrap,
    t(
      refreshed
        ? "search-templates.result.actions.refreshed"
        : "search-templates.result.actions.refresh-failed",
    ),
  );
};

function _onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") _closeAllMenus();
}

function _onDocumentClick(e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (target.closest('[id^="result-actions-"]')) return;
  _closeAllMenus();
}

let initialized = false;

export function initResultActions(): void {
  if (initialized) return;
  initialized = true;
  const list = document.getElementById("results-list");
  if (!list) return;
  list.addEventListener("click", (e) => {
    void _handleClick(e as MouseEvent);
  });
  document.addEventListener("click", _onDocumentClick, true);
  document.addEventListener("keydown", _onKeydown);
}
