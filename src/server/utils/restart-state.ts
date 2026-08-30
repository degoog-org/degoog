import type { RestartState } from "../../shared/restart-state";

export type { RestartState };

let _pending = false;
let _reasons: string[] = [];

export const markRestartPending = (reason: string): void => {
  _pending = true;
  if (!_reasons.includes(reason)) _reasons.push(reason);
};

export const getRestartState = (): RestartState => ({
  pending: _pending,
  reasons: [..._reasons],
});

export const clearRestartPending = (): void => {
  _pending = false;
  _reasons = [];
};

export const isExtensionRestartFlagVisible = (declared?: boolean): boolean =>
  Boolean(declared) && _pending;
