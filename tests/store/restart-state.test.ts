import { describe, test, expect, beforeEach } from "bun:test";
import {
  clearRestartPending,
  getRestartState,
  markRestartPending,
} from "../../src/server/utils/extension-support/restart-state";

describe("restart-state", () => {
  beforeEach(() => {
    clearRestartPending();
  });

  test("accumulates distinct reasons and ignores repeats", () => {
    markRestartPending("reason one");
    markRestartPending("reason one");
    markRestartPending("reason two");
    const state = getRestartState();
    expect(state.pending).toBe(true);
    expect(state.reasons).toEqual(["reason one", "reason two"]);
  });

  test("clearRestartPending resets pending and reasons", () => {
    markRestartPending("reason");
    clearRestartPending();
    expect(getRestartState()).toEqual({ pending: false, reasons: [] });
  });
});
