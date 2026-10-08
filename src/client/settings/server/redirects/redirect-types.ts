import type { RedirectCheck } from "../../../../shared/redirects/redirect-rules";

export interface RedirectRow {
  id: string;
  match: string;
  replace: string;
}

export interface CheckedRow {
  row: RedirectRow;
  check: RedirectCheck | null;
}

export interface RedirectBuilderState {
  open: boolean;
  before: string;
  after: string;
  allSubdomains: boolean | null;
  keepRest: boolean | null;
}

export interface RedirectEditorState {
  rows: RedirectRow[];
  builder: RedirectBuilderState;
  testUrl: string;
  legacy: number;
  unreadable: string[];
  oversized: string | null;
}

export interface RedirectActions {
  rowInput: (event: Event) => void;
  rowRemove: (event: Event) => void;
  addEmpty: () => void;
  builderToggle: () => void;
  builderBefore: (event: Event) => void;
  builderAfter: (event: Event) => void;
  builderSubdomains: (event: Event) => void;
  builderKeepRest: (event: Event) => void;
  builderAdd: () => void;
  testInput: (event: Event) => void;
}
