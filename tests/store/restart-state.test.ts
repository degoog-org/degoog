import { describe, test, expect, beforeEach } from "bun:test";
import {
  markRestartPending,
  getRestartState,
  clearRestartPending,
} from "../../src/server/utils/restart-state";

describe("restart-state", () => {
  beforeEach(() => {
    clearRestartPending();
  });

  test("starts with no restart pending", () => {
    expect(getRestartState()).toEqual({ pending: false, reasons: [] });
  });

  test("marking pending flips the flag and records the reason", () => {
    markRestartPending("transport \"acme\" was installed");
    const state = getRestartState();
    expect(state.pending).toBe(true);
    expect(state.reasons).toContain('transport "acme" was installed');
  });

  test("does not duplicate identical reasons", () => {
    markRestartPending("same reason");
    markRestartPending("same reason");
    expect(getRestartState().reasons).toEqual(["same reason"]);
  });

  test("accumulates distinct reasons", () => {
    markRestartPending("reason one");
    markRestartPending("reason two");
    expect(getRestartState().reasons).toEqual(["reason one", "reason two"]);
  });

  test("clearRestartPending resets pending and reasons", () => {
    markRestartPending("reason");
    clearRestartPending();
    expect(getRestartState()).toEqual({ pending: false, reasons: [] });
  });
});
