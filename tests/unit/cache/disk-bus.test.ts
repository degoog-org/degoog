import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  startDiskBus,
  stopDiskBus,
  writeBusEvent,
} from "../../../src/server/utils/cache/disk-bus";

const SETTLE_MS = 150;

let dataDir: string;
const _originalDataDir = process.env.DEGOOG_DATA_DIR;

const busFolder = (): string => join(dataDir, "bus");
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const collect = async (): Promise<unknown[]> => {
  const received: unknown[] = [];
  await startDiskBus((payload) => received.push(payload));
  return received;
};

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "degoog-disk-bus-"));
  process.env.DEGOOG_DATA_DIR = dataDir;
});

afterEach(() => {
  stopDiskBus();
});

afterAll(async () => {
  stopDiskBus();
  await rm(dataDir, { recursive: true, force: true });
  if (_originalDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
  else process.env.DEGOOG_DATA_DIR = _originalDataDir;
});

describe("utils/disk-bus", () => {
  test("delivers events exactly once, in the order they were written", async () => {
    const received = await collect();

    await writeBusEvent("plugin-settings", "weather-slot", { step: 1 });
    await writeBusEvent("extension-settings", "weather-slot", { step: 2 });
    await wait(SETTLE_MS);

    expect(received).toEqual([{ step: 1 }, { step: 2 }]);
  });

  test("ignores files that are not bus events", async () => {
    const received = await collect();

    await writeFile(join(busFolder(), "cached-image.png"), "binary-ish");
    await writeFile(join(busFolder(), "broken.json"), "{ not json");
    await writeFile(join(busFolder(), "wrong-shape.json"), JSON.stringify({ nope: true }));
    await wait(SETTLE_MS);

    expect(received).toEqual([]);
  });

  test("does not replay events that existed before it started", async () => {
    await writeBusEvent("cache-clear", "stale", { old: true });
    await collect();
    await writeBusEvent("cache-clear", "stale-seed", { seed: true });
    stopDiskBus();

    const received = await collect();
    await writeBusEvent("cache-clear", "fresh", { fresh: true });
    await wait(SETTLE_MS);

    expect(received).toEqual([{ fresh: true }]);
  });

  test("writing is a no-op while the bus is stopped", async () => {
    await collect();
    stopDiskBus();
    const before = await readdir(busFolder());

    await writeBusEvent("cache-clear", "while-stopped", { ignored: true });

    expect(await readdir(busFolder())).toEqual(before);
  });
});
