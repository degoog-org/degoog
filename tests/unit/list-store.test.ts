import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const settingsFile = join(tmpdir(), `degoog-ls-settings-${Date.now()}.json`);
const listsFile = join(tmpdir(), `degoog-ls-lists-${Date.now()}.json`);
const _originalSettingsFile = process.env.DEGOOG_SERVER_SETTINGS_FILE;
process.env.DEGOOG_SERVER_SETTINGS_FILE = settingsFile;

import { createListStore } from "../../src/server/utils/list-store";
import {
  clearServerSettingsCache,
  getInstanceSettings,
} from "../../src/server/utils/server-settings";

const KEYS = ["fooList", "barList"] as const;

const makeStore = () =>
  createListStore<(typeof KEYS)[number]>({
    keys: KEYS,
    file: () => listsFile,
    namespace: "test-list",
  });

const seedSettings = async (
  settings: Record<string, unknown>,
): Promise<void> => {
  await writeFile(
    settingsFile,
    JSON.stringify({ wizard: true, instanceId: "test", settings }),
  );
  clearServerSettingsCache();
};

const wipe = async (): Promise<void> => {
  await unlink(settingsFile).catch(() => {});
  await unlink(listsFile).catch(() => {});
  clearServerSettingsCache();
};

beforeEach(wipe);
afterEach(wipe);
afterAll(() => {
  if (_originalSettingsFile === undefined) {
    delete process.env.DEGOOG_SERVER_SETTINGS_FILE;
  } else {
    process.env.DEGOOG_SERVER_SETTINGS_FILE = _originalSettingsFile;
  }
});

describe("createListStore", () => {
  test("reads from legacy settings when no file exists", async () => {
    await seedSettings({ fooList: "a\nb" });
    const store = makeStore();
    expect((await store.readLists()).fooList).toBe("a\nb");
    expect((await store.readLists()).barList).toBe("");
  });

  test("writing migrates lists to the file and purges legacy keys", async () => {
    await seedSettings({ fooList: "a\nb", barList: "c", keep: "yes" });
    const store = makeStore();

    await store.writeList("fooList", "a\nb\nz");

    const fileData = JSON.parse(await readFile(listsFile, "utf-8"));
    expect(fileData.fooList).toBe("a\nb\nz");
    expect(fileData.barList).toBe("c");

    const settings = await getInstanceSettings();
    expect("fooList" in settings).toBe(false);
    expect("barList" in settings).toBe(false);
    expect(settings.keep).toBe("yes");

    expect((await store.readLists()).fooList).toBe("a\nb\nz");
  });

  test("isListKey only matches configured keys", () => {
    const store = makeStore();
    expect(store.isListKey("fooList")).toBe(true);
    expect(store.isListKey("nope")).toBe(false);
  });
});
