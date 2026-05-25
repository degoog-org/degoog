import { describe, test, expect } from "bun:test";
import { withTimeout } from "../../src/server/utils/with-timeout";

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
});
