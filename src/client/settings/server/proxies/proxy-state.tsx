import { render } from "../../../../shared/ui/tribute/dom";
import { getBase } from "../../../utils/net/base-url";
import { jsonHeaders } from "../../../utils/net/request";
import type {
  ProxyPingResult,
  ProxyRow,
  ProxyRowActions,
} from "../../../types/settings-proxy";
import { ProxyList } from "./proxy-list";
import { openProxyBulkModal, splitProxyLines } from "./proxy-bulk-modal";

export const PROXY_LIST_ID = "settings-proxy-list";
const PROXY_COUNT_ID = "settings-proxy-count";
export const PROXY_PING_BATCH = 64;
const SHOWN_PROXIES = 8;

const t = window.scopedT("core");

let rows: ProxyRow[] = [];
let showAll = false;
let nextId = 0;
let tokenGetter: () => string | null = () => null;
const listeners: (() => void)[] = [];

const CLEARED = { status: "idle", ms: null, ip: null } as const;

const _newRow = (url: string): ProxyRow => ({
  id: `proxy-${nextId++}`,
  url,
  ...CLEARED,
});

const _rowIdOf = (e: Event): string | undefined =>
  (e.currentTarget as HTMLElement | null)?.dataset.rowId;

function _changed(): void {
  for (const fn of listeners) fn();
}

function _draw(): void {
  const container = document.getElementById(PROXY_LIST_ID);
  if (!container) return;
  if (rows.length === 0) rows = [_newRow("")];
  render(<ProxyList rows={rows} limit={showAll ? rows.length : SHOWN_PROXIES} actions={actions} />, container);
  const count = document.getElementById(PROXY_COUNT_ID);
  if (count) {
    const filled = rows.filter((row) => row.url.trim()).length;
    count.textContent = filled ? t("settings-page.server.proxy-count", { count: String(filled) }) : "";
  }
}

function _patch(id: string, next: Partial<ProxyRow>): void {
  rows = rows.map((row) => (row.id === id ? { ...row, ...next } : row));
}

export function markProxiesPending(targets: ProxyRow[]): ProxyRow[] {
  for (const row of targets) {
    _patch(row.id, row.url.trim() ? { ...CLEARED, status: "pending" } : CLEARED);
  }
  _draw();
  return targets.filter((row) => row.url.trim());
}

const _statusFor = (result: ProxyPingResult, directIp: string | null): Partial<ProxyRow> => {
  if (!result.ok) return { ...CLEARED, status: "fail" };
  const leak = directIp !== null && result.ip === directIp;
  return { status: leak ? "leak" : "ok", ms: result.ms, ip: result.ip };
};

export function applyProxyResults(
  targets: ProxyRow[],
  results: ProxyPingResult[],
  directIp: string | null = null,
): void {
  targets.forEach((pinged, i) => {
    const current = rows.find((row) => row.id === pinged.id);
    if (!current || current.url !== pinged.url) return;
    const result = results[i];
    _patch(pinged.id, result ? _statusFor(result, directIp) : CLEARED);
  });
  _draw();
}

async function _ping(targets: ProxyRow[]): Promise<void> {
  const live = markProxiesPending(targets);
  if (live.length === 0) return;

  const batches: ProxyRow[][] = [];
  for (let i = 0; i < live.length; i += PROXY_PING_BATCH) batches.push(live.slice(i, i + PROXY_PING_BATCH));
  for (const batch of batches) await _pingBatch(batch);
}

async function _pingBatch(batch: ProxyRow[]): Promise<void> {
  let results: ProxyPingResult[] = [];
  try {
    const res = await fetch(`${getBase()}/api/settings/proxy-ping`, {
      method: "POST",
      headers: jsonHeaders(tokenGetter),
      body: JSON.stringify({ urls: batch.map((row) => row.url) }),
    });
    if (res.ok) results = ((await res.json()) as { results?: ProxyPingResult[] }).results ?? [];
  } catch (err) {
    console.warn("[settings] proxy ping failed", err);
  }

  applyProxyResults(batch, results);
}

const actions: ProxyRowActions = {
  rowInput: (e) => {
    const id = _rowIdOf(e);
    if (!id) return;
    _patch(id, { url: (e.currentTarget as HTMLInputElement).value, ...CLEARED });
    _draw();
    _changed();
  },
  rowCommit: (e) => {
    const row = rows.find((r) => r.id === _rowIdOf(e));
    if (row) void _ping([row]);
  },
  rowRemove: (e) => {
    const id = _rowIdOf(e);
    rows = rows.filter((row) => row.id !== id);
    _draw();
    _changed();
  },
  addRow: () => {
    rows = [...rows, _newRow("")];
    showAll = true;
    _draw();
    const inputs = document.querySelectorAll<HTMLInputElement>(`#${PROXY_LIST_ID} .settings-proxy-input`);
    inputs[inputs.length - 1]?.focus();
  },
  openBulk: () => openProxyBulkModal(addProxyUrls),
  showAll: () => {
    showAll = true;
    _draw();
  },
};

export function addProxyUrls(urls: string[]): void {
  const known = new Set(rows.map((row) => row.url.trim()));
  const fresh = urls.filter((url) => !known.has(url) && known.add(url)).map(_newRow);
  if (fresh.length === 0) return;
  rows = [...rows.filter((row) => row.url.trim()), ...fresh];
  _draw();
  _changed();
  void _ping(fresh);
}

export function initProxyList(getToken: () => string | null): void {
  tokenGetter = getToken;
  _draw();
}

export function loadProxyRows(raw: string): void {
  rows = splitProxyLines(raw).map(_newRow);
  _draw();
}

export const serializeProxyRows = (): string =>
  splitProxyLines(rows.map((row) => row.url).join("\n")).join("\n");

export const pingAllProxies = (): Promise<void> => _ping(rows);

export const currentProxyRows = (): ProxyRow[] => rows;

export function onProxiesChanged(fn: () => void): void {
  listeners.push(fn);
}
