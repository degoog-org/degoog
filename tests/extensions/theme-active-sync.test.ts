import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(tmpdir(), `degoog-theme-sync-${Date.now()}`);
const THEMES_ROOT = join(ROOT, "themes");
const SETTINGS_FILE = join(ROOT, "plugin-settings.json");

const _originalThemesDir = process.env.DEGOOG_THEMES_DIR;
const _originalSettingsFile = process.env.DEGOOG_PLUGIN_SETTINGS_FILE;

type Registry = typeof import("../../src/server/extensions/themes/registry");
type Valkey = typeof import("../../src/server/utils/cache/cache-valkey");

let registry: Registry;
let valkey: Valkey;

const addTheme = async (id: string): Promise<void> => {
  const dir = join(THEMES_ROOT, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "theme.json"), JSON.stringify({ name: id }));
};

const writeActiveFromOtherWorker = async (id: string): Promise<void> => {
  await writeFile(SETTINGS_FILE, JSON.stringify({ theme: { active: id } }));
  await valkey.publishInvalidate(valkey.INVALIDATE_SCOPE.PLUGIN_SETTINGS, "theme");
};

beforeAll(async () => {
  process.env.DEGOOG_THEMES_DIR = THEMES_ROOT;
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = SETTINGS_FILE;
  await addTheme("alpha");
  await addTheme("beta");
  registry = await import("../../src/server/extensions/themes/registry");
  valkey = await import("../../src/server/utils/cache/cache-valkey");
});

beforeEach(async () => {
  await writeActiveFromOtherWorker("");
  await registry.initThemes();
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
  if (_originalThemesDir === undefined) delete process.env.DEGOOG_THEMES_DIR;
  else process.env.DEGOOG_THEMES_DIR = _originalThemesDir;
  if (_originalSettingsFile === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
  else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = _originalSettingsFile;
});

describe("themes/active theme sync", () => {
  test("setActiveTheme persists the selection", async () => {
    expect(await registry.setActiveTheme("alpha")).toBe(true);
    expect(await registry.getActiveThemeId()).toBe("alpha");
  });

  test("picks up a theme change written by another worker", async () => {
    await registry.setActiveTheme("alpha");

    await writeActiveFromOtherWorker("beta");

    expect(await registry.getActiveThemeId()).toBe("beta");
    expect((await registry.getActiveTheme())?.id).toBe("beta");
  });

  test("switching back to the default theme clears the active id", async () => {
    await registry.setActiveTheme("alpha");
    await registry.setActiveTheme(null);
    expect(await registry.getActiveTheme()).toBeNull();
  });

  test("rejects a theme that is not installed", async () => {
    expect(await registry.setActiveTheme("missing")).toBe(false);
    expect(await registry.getActiveThemeId()).toBeNull();
  });

  test("reloadThemes loads newly installed themes", async () => {
    await addTheme("gamma");
    await registry.reloadThemes();
    expect(registry.getThemeById("gamma")).not.toBeNull();
    expect(await registry.setActiveTheme("gamma")).toBe(true);
    await rm(join(THEMES_ROOT, "gamma"), { recursive: true, force: true });
  });

  test("resets the active id when its theme is removed from disk", async () => {
    await addTheme("delta");
    await registry.reloadThemes();
    await registry.setActiveTheme("delta");

    await rm(join(THEMES_ROOT, "delta"), { recursive: true, force: true });
    await registry.reloadThemes();

    expect(await registry.getActiveTheme()).toBeNull();
  });
});
