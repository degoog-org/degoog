import { describe, test, expect } from "bun:test";
import { createMutex } from "../../src/server/utils/mutex";

describe("createMutex", () => {
  test("runs tasks one at a time in call order", async () => {
    const mutex = createMutex();
    const order: number[] = [];
    const task = (n: number, delay: number) =>
      mutex(async () => {
        await new Promise((r) => setTimeout(r, delay));
        order.push(n);
      });

    await Promise.all([task(1, 30), task(2, 10), task(3, 0)]);
    expect(order).toEqual([1, 2, 3]);
  });

  test("a rejected task does not wedge the queue", async () => {
    const mutex = createMutex();
    await expect(
      mutex(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const result = await mutex(async () => "ok");
    expect(result).toBe("ok");
  });
});
