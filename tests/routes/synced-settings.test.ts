import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readSyncedDefaults,
  writeSyncedDefaults,
} from "../../src/server/utils/synced-settings";
import {
  clearServerSettingsCache,
  updateInstanceSettings,
} from "../../src/server/utils/server-settings";

let tempDir: string;
let savedDataDir: string | undefined;
let savedSettingsFile: string | undefined;

beforeEach(() => {
  savedDataDir = process.env.DEGOOG_DATA_DIR;
  savedSettingsFile = process.env.DEGOOG_SERVER_SETTINGS_FILE;

  tempDir = mkdtempSync(join(tmpdir(), "degoog-synced-defaults-"));
  process.env.DEGOOG_DATA_DIR = tempDir;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(tempDir, "server-settings.json");
  clearServerSettingsCache();
});

afterEach(() => {
  clearServerSettingsCache();
  rmSync(tempDir, { recursive: true, force: true });
  if (savedDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
  else process.env.DEGOOG_DATA_DIR = savedDataDir;
  if (savedSettingsFile === undefined) delete process.env.DEGOOG_SERVER_SETTINGS_FILE;
  else process.env.DEGOOG_SERVER_SETTINGS_FILE = savedSettingsFile;
});

describe("utils/synced-settings", () => {
  test("write keeps whitelisted keys and drops unknown ones", async () => {
    const stored = await writeSyncedDefaults({
      theme: "dark",
      engines: { google: true },
      not_a_sync_key: "nope",
      apiKey: "secret",
    });

    expect(stored).toEqual({ theme: "dark", engines: { google: true } });
    expect(await readSyncedDefaults()).toEqual({
      theme: "dark",
      engines: { google: true },
    });
  });

  test("read returns empty object when nothing has been published", async () => {
    expect(await readSyncedDefaults()).toEqual({});
  });

  test("read recovers from a corrupt syncedDefaults value", async () => {
    await updateInstanceSettings({ syncedDefaults: "{not json" });
    clearServerSettingsCache();

    expect(await readSyncedDefaults()).toEqual({});
  });

  test("read strips non-whitelisted keys even if storage is tampered", async () => {
    await updateInstanceSettings({
      syncedDefaults: JSON.stringify({
        theme: "dark",
        password: "hunter2",
        apiKey: "secret-token",
        settingsPasswords: "leak",
      }),
    });
    clearServerSettingsCache();

    expect(await readSyncedDefaults()).toEqual({ theme: "dark" });
  });

  test("tab order is server-side and not a synced client key", async () => {
    await updateInstanceSettings({
      syncedDefaults: JSON.stringify({
        engines: { google: true },
        "tab-order-saved": ["web", "images"],
      }),
    });
    clearServerSettingsCache();

    expect(await readSyncedDefaults()).toEqual({ engines: { google: true } });
  });
});
