import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { initValkey, VALKEY_URL_ENV } from "../../../src/server/utils/cache/cache-valkey";
import { stopDiskBus } from "../../../src/server/utils/cache/disk-bus";

let root: string;
const _originalDataDir = process.env.DEGOOG_DATA_DIR;
const _originalValkeyUrl = process.env[VALKEY_URL_ENV];

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "degoog-valkey-fallback-"));
  delete process.env[VALKEY_URL_ENV];
});

afterEach(() => {
  stopDiskBus();
});

afterAll(async () => {
  stopDiskBus();
  await rm(root, { recursive: true, force: true });
  if (_originalDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
  else process.env.DEGOOG_DATA_DIR = _originalDataDir;
  if (_originalValkeyUrl === undefined) delete process.env[VALKEY_URL_ENV];
  else process.env[VALKEY_URL_ENV] = _originalValkeyUrl;
});

describe("utils/cache-valkey disk fallback", () => {
  test("retries after the disk bus fails to start", async () => {
    const blocked = join(root, "blocked");
    await writeFile(blocked, "not a directory");
    process.env.DEGOOG_DATA_DIR = blocked;

    await initValkey("instance-a");
    expect(await readdir(root)).toEqual(["blocked"]);

    const usable = join(root, "usable");
    process.env.DEGOOG_DATA_DIR = usable;

    await initValkey("instance-a");
    expect(await readdir(usable)).toContain("bus");
  });
});
