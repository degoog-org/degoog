import { cleanUrl } from "../utils/dom";
import { getBase } from "../utils/base-url";
import { attachFaviconFallback } from "../utils/favicon";
import { confirmModal } from "./modals/confirm-modal/confirm";
import { promptModal } from "./modals/prompt-modal/prompt";

const TOKEN_KEY = "degoog-settings-token";
const TOGGLE_PREFIX = "result-actions-toggle-";
const MENU_PREFIX = "result-actions-menu-";
const ACTIONS_PREFIX = "result-actions-";
const ACTION_BLOCK_PREFIX = "result-action-block-";
const ACTION_REPLACE_PREFIX = "result-action-replace-";
const ACTION_SCORE_PREFIX = "result-action-score-";

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

const _postAction = async (body: {
  kind: "block" | "replace" | "score";
  source: string;
  target?: string;
  score?: number;
}): Promise<boolean> => {
  const token = _getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["x-settings-token"] = token;
  try {
    const res = await fetch(`${getBase()}/api/settings/domain-action`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    return res.ok;
  } catch {
    return false;
  }
};

function _removeRowsForHost(host: string): void {
  document.querySelectorAll<HTMLElement>(".result-item").forEach((row) => {
    const wrap = row.querySelector<HTMLElement>('[id^="result-actions-"]');
    const rowHost = wrap?.dataset.host;
    if (!rowHost) return;
    if (rowHost === host || rowHost.endsWith(`.${host}`)) row.remove();
  });
}

function _applyReplaceToRow(row: HTMLElement, target: string): void {
  const link = row.querySelector<HTMLAnchorElement>(".result-title");
  const cite = row.querySelector<HTMLElement>(".result-cite");
  const favicon = row.querySelector<HTMLImageElement>(".result-favicon");
  const wrap = row.querySelector<HTMLElement>('[id^="result-actions-"]');
  if (!link) return;
  try {
    const url = new URL(link.href);
    url.hostname = target;
    link.href = url.toString();
    if (cite) cite.textContent = cleanUrl(url.toString());
    if (favicon) {
      favicon.dataset.faviconHost = target;
      attachFaviconFallback(favicon);
    }
    if (wrap) wrap.dataset.host = target;
  } catch {}
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
  let kind: "block" | "replace" | "score" | null = null;
  let idx: string | null = null;
  if ((idx = _idIndex(ACTION_BLOCK_PREFIX, item.id))) kind = "block";
  else if ((idx = _idIndex(ACTION_REPLACE_PREFIX, item.id))) kind = "replace";
  else if ((idx = _idIndex(ACTION_SCORE_PREFIX, item.id))) kind = "score";
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
    const ok = await _postAction({ kind, source: host });
    if (ok) _removeRowsForHost(host);
    return;
  }

  if (kind === "replace") {
    const replacement = await promptModal({
      title: t("search-templates.result.actions.prompt-target-title"),
      description: t("search-templates.result.actions.prompt-target"),
      placeholder: "example.com",
    });
    if (!replacement) return;
    const ok = await _postAction({ kind, source: host, target: replacement });
    if (ok) _applyReplaceToRow(row, replacement);
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
    const ok = await _postAction({ kind, source: host, score });
    if (ok) _showToast(wrap, t("search-templates.result.actions.scored"));
  }
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
