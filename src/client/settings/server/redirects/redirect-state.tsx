import { render } from "../../../../shared/ui/tribute/dom";
import { initDragOrder } from "../../../utils/dom/drag-order";
import {
  buildExampleRule,
  inferRedirect,
  inferredChoices,
  reproducesExample,
  type RedirectChoices,
  type RedirectExample,
} from "../../../../shared/redirects/redirect-builder";
import {
  checkRedirectRule,
  parseRedirectList,
  serializeRedirectRules,
  type RedirectRule,
} from "../../../../shared/redirects/redirect-rules";
import { RedirectEditor } from "./redirect-editor";
import type {
  CheckedRow,
  RedirectActions,
  RedirectBuilderState,
  RedirectEditorState,
} from "./redirect-types";

export const REDIRECT_EDITOR_ID = "settings-domain-replace-editor";

const ROWS_SELECTOR = ".settings-redirect-rows";
const ROW_SELECTOR = ".settings-redirect-row";

type ChangeListener = () => void;

const _freshBuilder = (open: boolean): RedirectBuilderState => ({
  open,
  before: "",
  after: "",
  allSubdomains: null,
  keepRest: null,
});

const _state: RedirectEditorState = {
  rows: [],
  builder: _freshBuilder(false),
  testUrl: "",
  legacy: 0,
  unreadable: [],
  oversized: null,
};

const _listeners: ChangeListener[] = [];
let _nextId = 0;

const _newId = (): string => `redirect-${++_nextId}`;

const _isBlank = (rule: RedirectRule): boolean => !rule.match.trim() && !rule.replace.trim();

export const checkedRows = (): CheckedRow[] =>
  _state.rows.map((row) => ({ row, check: _isBlank(row) ? null : checkRedirectRule(row) }));

export const hasRedirectProblems = (): boolean =>
  checkedRows().some(({ check }) => check !== null && !check.ok);

export const serializeRedirectRows = (): string => serializeRedirectRules(_state.rows);

export const isRedirectEditorLocked = (): boolean => _state.oversized !== null;

export const needsRedirectMigration = (): boolean =>
  _state.legacy > 0 || _state.unreadable.length > 0;

export function onRedirectsChanged(listener: ChangeListener): void {
  _listeners.push(listener);
}

const _target = (event: Event): HTMLElement | null =>
  event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

const _valueOf = (event: Event): string => {
  const target = event.currentTarget;
  return target instanceof HTMLInputElement ? target.value : "";
};

const _checked = (event: Event): boolean => {
  const target = event.currentTarget;
  return target instanceof HTMLInputElement && target.checked;
};

export interface BuilderView {
  example: RedirectExample;
  choices: RedirectChoices;
  rule: RedirectRule;
  reproduces: boolean;
}

export const builderView = (builder: RedirectBuilderState): BuilderView | null => {
  const example = inferRedirect(builder.before, builder.after);
  if (!example) return null;
  const inferred = inferredChoices(example);
  const choices = {
    allSubdomains: builder.allSubdomains ?? inferred.allSubdomains,
    keepRest: builder.keepRest ?? inferred.keepRest,
  };
  return { example, choices, rule: buildExampleRule(example, choices), reproduces: reproducesExample(example) };
};

function _paint(): void {
  const container = document.getElementById(REDIRECT_EDITOR_ID);
  if (!container) return;
  render(
    <RedirectEditor state={_state} rows={checkedRows()} view={builderView(_state.builder)} actions={_actions} />,
    container,
  );
  const list = container.querySelector<HTMLElement>(ROWS_SELECTOR);
  if (!list) return;
  initDragOrder(list, {
    itemSelector: ROW_SELECTOR,
    handleSelector: "[data-drag-handle]",
    onReorder: (rowsEl) =>
      reorderRedirectRows(
        [...rowsEl.querySelectorAll<HTMLElement>(ROW_SELECTOR)].map((row) => row.dataset.rowId ?? ""),
      ),
  });
}

function _changed(): void {
  _paint();
  for (const listener of _listeners) listener();
}

function _focusRow(id: string): void {
  const input = document.querySelector<HTMLInputElement>(`[data-row-id="${id}"][data-field="match"]`);
  input?.scrollIntoView({ block: "center", behavior: "smooth" });
  input?.focus({ preventScroll: true });
}

function _setExample(field: "before" | "after", value: string): void {
  _state.builder[field] = value;
  _state.builder.allSubdomains = null;
  _state.builder.keepRest = null;
  _paint();
}

const _actions: RedirectActions = {
  rowInput: (event) => {
    const data = _target(event)?.dataset;
    const row = _state.rows.find((entry) => entry.id === data?.rowId);
    if (!row) return;
    if (data?.field === "match") row.match = _valueOf(event);
    else if (data?.field === "replace") row.replace = _valueOf(event);
    _changed();
  },
  rowRemove: (event) => {
    const id = _target(event)?.dataset.rowId;
    _state.rows = _state.rows.filter((row) => row.id !== id);
    _changed();
  },
  addEmpty: () => {
    const id = _newId();
    _state.rows.push({ id, match: "", replace: "" });
    _changed();
    document.querySelector<HTMLInputElement>(`[data-row-id="${id}"][data-field="match"]`)?.focus();
  },
  builderToggle: () => {
    _state.builder.open = !_state.builder.open;
    _paint();
  },
  builderBefore: (event) => _setExample("before", _valueOf(event)),
  builderAfter: (event) => _setExample("after", _valueOf(event)),
  builderSubdomains: (event) => {
    _state.builder.allSubdomains = _checked(event);
    _paint();
  },
  builderKeepRest: (event) => {
    _state.builder.keepRest = _checked(event);
    _paint();
  },
  builderAdd: () => {
    const view = builderView(_state.builder);
    if (!view?.reproduces || !checkRedirectRule(view.rule).ok) return;
    const rule = view.rule;
    const existing = _state.rows.find((row) => row.match.trim() === rule.match.trim());
    const id = existing?.id ?? _newId();
    if (existing) existing.replace = rule.replace;
    else _state.rows.push({ id, ...rule });
    _changed();
    _focusRow(id);
  },
  testInput: (event) => {
    _state.testUrl = _valueOf(event);
    _paint();
  },
};

export function reorderRedirectRows(ids: string[]): void {
  const byId = new Map(_state.rows.map((row) => [row.id, row]));
  _state.rows = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  _changed();
}

export function loadRedirectRows(raw: string, oversized: string | null): void {
  const parsed = parseRedirectList(raw);
  _state.rows = parsed.rules.map((rule) => ({ id: _newId(), ...rule }));
  _state.legacy = parsed.legacy;
  _state.unreadable = parsed.unreadable;
  _state.oversized = oversized;
  _paint();
}

export function markRedirectsSaved(): void {
  _state.legacy = 0;
  _state.unreadable = [];
  _paint();
}
