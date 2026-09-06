import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const FACTORY_MOD = "../../src/server/indexer/db/factory";

const factoryReal = { ...(await import(FACTORY_MOD)) };

let bootCalls = 0;
let releaseBoot: () => void = () => {};
let failBoot: (err: Error) => void = () => {};

let startQueue: typeof import("../../src/server/indexer/queue/queue").startQueue;
let stopQueue: typeof import("../../src/server/indexer/queue/queue").stopQueue;

describe("indexer queue startup", () => {
  beforeAll(async () => {
    mock.module(FACTORY_MOD, () => ({
      ...factoryReal,
      bootAdapter: async () => {
        bootCalls += 1;
        await new Promise<void>((resolve, reject) => {
          releaseBoot = resolve;
          failBoot = reject;
        });
      },
    }));
    const queue = await import("../../src/server/indexer/queue/queue");
    startQueue = queue.startQueue;
    stopQueue = queue.stopQueue;
  });

  afterAll(async () => {
    await stopQueue();
    mock.module(FACTORY_MOD, () => factoryReal);
  });

  test("concurrent starts boot the adapter once and install one timer pair", async () => {
    bootCalls = 0;
    const first = startQueue();
    const second = startQueue();

    expect(bootCalls).toBe(1);

    releaseBoot();
    await Promise.all([first, second]);

    expect(bootCalls).toBe(1);

    await startQueue();

    expect(bootCalls).toBe(1);

    await stopQueue();
  });

  test("stopQueue waits for a pending start before clearing its timers", async () => {
    bootCalls = 0;
    const start = startQueue();
    const stop = stopQueue();

    releaseBoot();
    await Promise.all([start, stop]);

    expect(bootCalls).toBe(1);

    const restart = startQueue();

    expect(bootCalls).toBe(2);

    releaseBoot();
    await restart;
    await stopQueue();
  });

  test("a failed adapter boot rejects the start and installs no timers", async () => {
    bootCalls = 0;
    const start = startQueue();

    failBoot(new Error("adapter boot timed out"));

    await expect(start).rejects.toThrow("adapter boot timed out");

    const retry = startQueue();

    expect(bootCalls).toBe(2);

    releaseBoot();
    await retry;
    await stopQueue();
  });
});
