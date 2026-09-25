import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  INVALIDATE_SCOPE,
  closeValkey,
  initValkey,
  onInvalidate,
  publishInvalidate,
  type InvalidatePayload,
} from "../../../src/server/utils/cache/cache-valkey";

const SETTLE_MS = 200;
const VALKEY_MODULE = resolve(import.meta.dir, "../../../src/server/utils/cache/cache-valkey");

let dataDir: string;
let childScript: string;
let received: InvalidatePayload[] = [];
let stopListening: () => void = () => {};

const _originalDataDir = process.env.DEGOOG_DATA_DIR;
const _originalValkeyUrl = process.env.DEGOOG_VALKEY_URL;

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "degoog-bus-xproc-"));
  process.env.DEGOOG_DATA_DIR = dataDir;
  delete process.env.DEGOOG_VALKEY_URL;

  childScript = join(dataDir, "other-worker.ts");
  await writeFile(
    childScript,
    [
      `import { INVALIDATE_SCOPE, closeValkey, initValkey, publishInvalidate } from ${JSON.stringify(VALKEY_MODULE)};`,
      `await initValkey("test");`,
      `await publishInvalidate(INVALIDATE_SCOPE.PLUGIN_SETTINGS, "weather-slot");`,
      `await publishInvalidate(INVALIDATE_SCOPE.EXTENSION_SETTINGS, "weather-slot");`,
      `await publishInvalidate(INVALIDATE_SCOPE.EXTENSIONS, "theme:bump");`,
      `await closeValkey();`,
    ].join("\n"),
  );

  await initValkey("test");
  stopListening = onInvalidate((payload) => received.push(payload));
});

afterAll(async () => {
  stopListening();
  await closeValkey();
  await rm(dataDir, { recursive: true, force: true });
  if (_originalDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
  else process.env.DEGOOG_DATA_DIR = _originalDataDir;
  if (_originalValkeyUrl !== undefined) process.env.DEGOOG_VALKEY_URL = _originalValkeyUrl;
});

describe("disk bus across processes without valkey", () => {
  test("another process's invalidations reach this process in order", async () => {
    received = [];

    const child = Bun.spawn([process.execPath, childScript], {
      env: { ...process.env, DEGOOG_DATA_DIR: dataDir, LOG_LEVEL: "" },
      stdout: "ignore",
      stderr: "inherit",
    });
    expect(await child.exited).toBe(0);
    await wait(SETTLE_MS);

    expect(received.map(({ scope, key }) => ({ scope, key }))).toEqual([
      { scope: INVALIDATE_SCOPE.PLUGIN_SETTINGS, key: "weather-slot" },
      { scope: INVALIDATE_SCOPE.EXTENSION_SETTINGS, key: "weather-slot" },
      { scope: INVALIDATE_SCOPE.EXTENSIONS, key: "theme:bump" },
    ]);
  });

  test("this process does not receive its own events twice", async () => {
    received = [];

    await publishInvalidate(INVALIDATE_SCOPE.CACHE_CLEAR, "own-namespace");
    await wait(SETTLE_MS);

    expect(received).toHaveLength(1);
  });
});
