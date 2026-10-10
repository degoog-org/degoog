import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ExtensionStoreType } from "../../src/server/types/extension";
import { uninstallItem } from "../../src/server/extensions/store/item-lifecycle";
import { clearPluginSettingsCache } from "../../src/server/utils/settings/plugin-settings";
import { clearServerSettingsCache } from "../../src/server/utils/settings/server-settings";
import { clearShortcutsSettingsCache } from "../../src/server/utils/settings/shortcuts-settings";
import { primeEngineHosts } from "../../src/server/extensions/engines/engine-hosts";

const REPO_URL = "https://example.com/Acme/Extensions.git";
const GONE = "acme-extensions-searxng-web";
const GONE_ID = `${GONE}-engine`;
const KEPT_ID = "acme-extensions-bing-engine";

const PINNED_ENV: Record<string, string> = {
  DEGOOG_DATA_DIR: "",
  DEGOOG_ENGINES_DIR: "engines",
  DEGOOG_SHORTCUTS_DIR: "shortcuts",
  DEGOOG_PLUGIN_SETTINGS_FILE: "plugin-settings.json",
  DEGOOG_SERVER_SETTINGS_FILE: "server-settings.json",
  DEGOOG_DEFAULT_ENGINES_FILE: "default-engines.json",
  DEGOOG_ENGINE_HOSTS_FILE: "engine-hosts.json",
};

let tempDir = "";
let previousEnv: Record<string, string | undefined> = {};

const _write = (file: string, value: unknown): void =>
  writeFileSync(join(tempDir, file), JSON.stringify(value));

const _read = <T,>(file: string): T =>
  JSON.parse(readFileSync(join(tempDir, file), "utf-8")) as T;

const seed = async (
  type: ExtensionStoreType,
  dir: string,
  itemPath: string,
  installedAs: string,
): Promise<void> => {
  tempDir = mkdtempSync(join(tmpdir(), "degoog-uninstall-purge-"));
  previousEnv = Object.fromEntries(
    Object.keys(PINNED_ENV).map((key) => [key, process.env[key]]),
  );
  for (const [key, file] of Object.entries(PINNED_ENV))
    process.env[key] = join(tempDir, file);
  mkdirSync(join(tempDir, dir, installedAs), { recursive: true });
  _write("repos.json", {
    repos: [],
    installed: [
      { repoUrl: REPO_URL, type, itemPath, installedAs, installedAt: "", version: "1.0.0" },
    ],
  });
  _write("plugin-settings.json", {
    [GONE_ID]: { disabled: false, url: "http://127.0.0.1:8888/search" },
    [KEPT_ID]: { disabled: true },
    "acme-extensions-jump-shortcut": { disabled: false },
    shortcuts: {
      "acme-extensions-jump-shortcut": JSON.stringify({ key: "j" }),
      "builtin-focus-shortcut": JSON.stringify({ key: "/" }),
    },
  });
  _write("default-engines.json", {
    [GONE_ID]: true,
    [GONE]: true,
    [KEPT_ID]: false,
    bangs: { [GONE_ID]: true, [GONE]: false, [KEPT_ID]: true },
  });
  _write("engine-hosts.json", { [GONE_ID]: "127.0.0.1", [KEPT_ID]: "www.bing.com" });
  _write("server-settings.json", {
    wizard: false,
    instanceId: "test",
    settings: {
      syncedDefaults: JSON.stringify({
        engines: { [GONE_ID]: true, [KEPT_ID]: true },
        engine_bangs: { [GONE_ID]: false },
      }),
    },
  });
  clearPluginSettingsCache();
  clearServerSettingsCache();
  clearShortcutsSettingsCache();
  await primeEngineHosts();
};

afterEach(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
  previousEnv = {};
  clearPluginSettingsCache();
  clearServerSettingsCache();
  clearShortcutsSettingsCache();
});

describe("uninstalling an engine erases every setting it left behind", () => {
  test("plugin settings, default toggles, bangs, synced defaults and hosts", async () => {
    await seed(ExtensionStoreType.Engine, "engines", "searxng-web", GONE);

    await uninstallItem(REPO_URL, "searxng-web", ExtensionStoreType.Engine);

    const settings = _read<Record<string, unknown>>("plugin-settings.json");
    expect(settings[GONE_ID]).toBeUndefined();
    expect(settings[KEPT_ID]).toEqual({ disabled: true });

    expect(_read<Record<string, unknown>>("default-engines.json")).toEqual({
      [KEPT_ID]: false,
      bangs: { [KEPT_ID]: true },
    });

    const hosts = _read<Record<string, string>>("engine-hosts.json");
    expect(hosts[GONE_ID]).toBeUndefined();
    expect(hosts[KEPT_ID]).toBe("www.bing.com");

    const server = _read<{ settings: { syncedDefaults: string } }>("server-settings.json");
    expect(JSON.parse(server.settings.syncedDefaults)).toEqual({
      engines: { [KEPT_ID]: true },
      engine_bangs: {},
    });
  });
});

describe("uninstalling a shortcut erases its binding", () => {
  test("drops the binding and its settings, keeps everyone else's", async () => {
    await seed(
      ExtensionStoreType.Shortcut,
      "shortcuts",
      "jump",
      "acme-extensions-jump-shortcut",
    );

    await uninstallItem(REPO_URL, "jump", ExtensionStoreType.Shortcut);

    const settings = _read<Record<string, Record<string, unknown>>>("plugin-settings.json");
    expect(settings["acme-extensions-jump-shortcut"]).toBeUndefined();
    expect(settings.shortcuts).toEqual({
      "builtin-focus-shortcut": JSON.stringify({ key: "/" }),
    });
    expect(settings[GONE_ID]).toBeDefined();
  });
});
