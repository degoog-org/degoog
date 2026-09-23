import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { IndexRow } from "../../src/server/indexer/recorders/default";

const FACTORY_MOD = "../../src/server/indexer/db/factory";
const CONFIG_MOD = "../../src/server/indexer/config/load";

const factoryReal = { ...(await import(FACTORY_MOD)) };
const configReal = { ...(await import(CONFIG_MOD)) };

let written: IndexRow[] = [];
let failNextWrite = false;

let queue: typeof import("../../src/server/indexer/queue/queue");

const rowsFor = (type: string, count: number): IndexRow[] =>
  Array.from({ length: count }, (_, i) => ({ engine_type: type, url: `/r${i}` }) as IndexRow);

const drain = async (): Promise<void> => {
  failNextWrite = false;
  await queue.flushQueue();
  await queue.flushQueue();
  written = [];
};

describe("a failed flush keeps its rows", () => {
  beforeAll(async () => {
    mock.module(CONFIG_MOD, () => ({
      ...configReal,
      getIndexerConfig: async () => ({ rankingWindow: 10 }),
    }));
    mock.module(FACTORY_MOD, () => ({
      ...factoryReal,
      getAdapter: () => ({
        writeBatch: async (_type: string, rows: IndexRow[]) => {
          if (failNextWrite) throw new Error("disk went away");
          written.push(...rows);
        },
      }),
    }));
    queue = await import("../../src/server/indexer/queue/queue");
  });

  afterAll(() => {
    mock.module(FACTORY_MOD, () => factoryReal);
    mock.module(CONFIG_MOD, () => configReal);
  });

  test("rows survive a failed write and land on the next flush", async () => {
    await drain();
    failNextWrite = true;
    queue.enqueue(rowsFor("web", 3));
    await queue.flushQueue();
    expect(written).toHaveLength(0);

    failNextWrite = false;
    await queue.flushQueue();
    expect(written).toHaveLength(3);
  });

  test("a second flush after success does not write the same rows twice", async () => {
    await drain();
    queue.enqueue(rowsFor("web", 2));
    await queue.flushQueue();
    await queue.flushQueue();
    expect(written).toHaveLength(2);
  });

  test("the retry buffer is capped so a dead adapter cannot grow it forever", async () => {
    await drain();
    failNextWrite = true;
    for (let i = 0; i < 12; i++) {
      queue.enqueue(rowsFor("images", 1000));
      await queue.flushQueue();
    }

    failNextWrite = false;
    await queue.flushQueue();
    expect(written.length).toBe(queue.MAX_PENDING_PER_TYPE);
  });
});
