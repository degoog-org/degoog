import { describe, test, expect } from "bun:test";
import { withTimeout } from "../../../src/server/utils/net/with-timeout";

describe("withTimeout", () => {
  test("resolves when the promise settles before the deadline", async () => {
    const value = await withTimeout(Promise.resolve("ok"), 1000);
    expect(value).toBe("ok");
  });

  test("rejects when the promise outlasts the deadline", async () => {
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => resolve("late"), 1000),
    );
    await expect(withTimeout(slow, 20, "slow op")).rejects.toThrow(
      /slow op timeout/,
    );
  });

  test("rejects as soon as the signal aborts, long before the deadline", async () => {
    const controller = new AbortController();
    const pending = withTimeout(new Promise<string>(() => {}), 60_000, "hung op", controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/hung op aborted/);
  });
});
