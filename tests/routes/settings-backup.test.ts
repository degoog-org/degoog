import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import backupRouter from "../../src/server/routes/settings-backup";
import {
  clearServerSettingsCache,
  getInstanceSettings,
  updateInstanceSettings,
} from "../../src/server/utils/server-settings";
import {
  readDomainLists,
  writeDomainList,
} from "../../src/server/utils/domain-lists";
import { clearPluginSettingsCache } from "../../src/server/utils/plugin-settings";
import {
  clearShortcutsSettingsCache,
  readShortcutsSettings,
} from "../../src/server/utils/shortcuts-settings";
import { MAX_SETTINGS_BACKUP_BYTES } from "../../src/shared/settings-backup";

type ExportBody = {
  kind: string;
  version: number;
  settings: Record<string, string>;
  extensions: {
    repos: string[];
    installed: { repoUrl: string; type: string; itemPath: string }[];
    settings: Record<string, Record<string, unknown>>;
    defaultEngines: Record<string, boolean>;
  };
  instance: {
    syncedDefaults: Record<string, unknown> | null;
    engineTabsOrder: string[] | null;
  };
  aliases: Record<string, string> | null;
  shortcutSources: { name: string; source: string }[];
};

// Import writes every list field, so isolate the shared indexer paths too.
const ISOLATED_ENV = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_INDEXER_DIR",
  "DEGOOG_INDEXER_CONFIG_FILE",
  "DEGOOG_SEARCH_LISTS_FILE",
  "DEGOOG_PLUGIN_SETTINGS_FILE",
  "DEGOOG_DEFAULT_ENGINES_FILE",
  "DEGOOG_ALIASES_FILE",
  "DEGOOG_SHORTCUTS_DIR",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
] as const;

let tempDir: string;
let savedEnv: Record<string, string | undefined>;

const exportSettings = async (): Promise<ExportBody> => {
  const res = await backupRouter.request("http://localhost/api/settings/export");
  expect(res.status).toBe(200);
  return (await res.json()) as ExportBody;
};

const REPO_URL = "https://example.invalid/degoog/extensions.git";

const seedInstance = (): void => {
  writeFileSync(
    join(tempDir, "repos.json"),
    JSON.stringify({
      repos: [{ url: REPO_URL, localPath: "example-extensions" }],
      installed: [
        {
          repoUrl: REPO_URL,
          type: "plugin",
          itemPath: "plugins/define",
          installedAs: "example-extensions-define",
          installedAt: "2026-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
      ],
    }),
  );
  writeFileSync(
    join(tempDir, "plugin-settings.json"),
    JSON.stringify({ "example-slot": { priority: "3" }, __schemaVersion: 1 }),
  );
  writeFileSync(
    join(tempDir, "default-engines.json"),
    JSON.stringify({ "example-engine": false }),
  );
  clearPluginSettingsCache();
};

const SHORTCUT_FILE = "midnight-shortcut.js";
const SHORTCUT_SOURCE =
  "export default { name: 'Midnight', defaultBinding: { key: 'm' }, run: () => {} };\n";

const seedExtras = (): void => {
  writeFileSync(
    join(tempDir, "aliases.json"),
    JSON.stringify({ gh: "github", "": "empty", long: "x".repeat(200) }),
  );
  mkdirSync(join(tempDir, "shortcuts", "store-shortcut"), { recursive: true });
  writeFileSync(
    join(tempDir, "shortcuts", SHORTCUT_FILE),
    SHORTCUT_SOURCE,
  );
  writeFileSync(
    join(tempDir, "shortcuts", "store-shortcut", "index.js"),
    "export default { name: 'Store', defaultBinding: { key: 's' }, run: () => {} };\n",
  );
};

const importBackup = async (body: unknown): Promise<Response> =>
  backupRouter.request(
    new Request("http://localhost/api/settings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  savedEnv = Object.fromEntries(
    ISOLATED_ENV.map((name) => [name, process.env[name]]),
  );
  for (const name of ISOLATED_ENV) delete process.env[name];

  tempDir = mkdtempSync(join(tmpdir(), "degoog-settings-backup-"));
  Object.assign(process.env, {
    DEGOOG_DATA_DIR: tempDir,
    DEGOOG_SERVER_SETTINGS_FILE: join(tempDir, "server-settings.json"),
    DEGOOG_INDEXER_DIR: join(tempDir, "indexer"),
    DEGOOG_INDEXER_CONFIG_FILE: join(tempDir, "indexer-config.json"),
    DEGOOG_SEARCH_LISTS_FILE: join(tempDir, "search-lists.json"),
    DEGOOG_PLUGIN_SETTINGS_FILE: join(tempDir, "plugin-settings.json"),
    DEGOOG_DEFAULT_ENGINES_FILE: join(tempDir, "default-engines.json"),
    DEGOOG_DANGEROUSLY_NO_PASSWORD: "true",
  });
  clearServerSettingsCache();
  clearPluginSettingsCache();
  clearShortcutsSettingsCache();
});

afterEach(() => {
  clearServerSettingsCache();
  clearPluginSettingsCache();
  clearShortcutsSettingsCache();
  rmSync(tempDir, { recursive: true, force: true });
  for (const name of ISOLATED_ENV) {
    const value = savedEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("routes/settings-backup", () => {
  test("export only carries keys the settings schema knows", async () => {
    await updateInstanceSettings({
      acDebounceMs: "450",
      apiSecretKey: "do-not-leak",
    });

    const body = await exportSettings();

    expect(body.kind).toBe("degoog-settings");
    expect(body.settings.acDebounceMs).toBe("450");
    expect(body.settings).not.toHaveProperty("apiSecretKey");
    expect(body.settings).not.toHaveProperty("instanceId");
  });

  test("a round trip restores values and list fields", async () => {
    await updateInstanceSettings({ acDebounceMs: "450" });
    const backup = await exportSettings();
    backup.settings.acDebounceMs = "777";
    backup.settings.domainBlockList = "example.invalid\nspam.invalid";

    const res = await importBackup(backup);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    const restored = await exportSettings();
    expect(restored.settings.acDebounceMs).toBe("777");
    expect((await readDomainLists()).domainBlockList).toBe(
      "example.invalid\nspam.invalid",
    );
  });

  test("import drops unknown keys rather than storing them", async () => {
    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: { acDebounceMs: "120", somethingElse: "nope" },
    });
    expect(await res.json()).toMatchObject({ applied: 1 });

    // Check the store directly; exportSettings() would filter the key too.
    const stored = await getInstanceSettings();
    expect(stored).not.toHaveProperty("somethingElse");
  });

  test("import rejects anything that is not a known backup", async () => {
    const cases: unknown[] = [
      {},
      { kind: "something-else", version: 1, settings: {} },
      { kind: "degoog-settings", version: 2, settings: { acDebounceMs: "1" } },
      { kind: "degoog-settings", version: 0, settings: { acDebounceMs: "1" } },
      { kind: "degoog-settings", version: -1, settings: { acDebounceMs: "1" } },
      { kind: "degoog-settings", version: 1.5, settings: { acDebounceMs: "1" } },
      { kind: "degoog-settings", version: 1, settings: [] },
      { kind: "degoog-settings", version: 1, settings: { onlyJunk: "1" } },
    ];
    for (const payload of cases) {
      expect((await importBackup(payload)).status).toBe(400);
    }
  });

  test("export carries repos, installed items, extension settings and engine toggles", async () => {
    seedInstance();

    const { extensions } = await exportSettings();

    expect(extensions.repos).toEqual([REPO_URL]);
    expect(extensions.installed).toEqual([
      { repoUrl: REPO_URL, type: "plugin", itemPath: "plugins/define" },
    ]);
    expect(extensions.settings["example-slot"]).toEqual({ priority: "3" });
    expect(extensions.settings).not.toHaveProperty("__schemaVersion");
    expect(extensions.defaultEngines).toEqual({ "example-engine": false });
  });

  test("import restores extension settings and engine toggles", async () => {
    seedInstance();

    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: {},
      extensions: {
        repos: [REPO_URL],
        installed: [
          { repoUrl: REPO_URL, type: "plugin", itemPath: "plugins/missing" },
        ],
        settings: { "example-slot": { priority: "9" }, __schemaVersion: {} },
        defaultEngines: { "example-engine": true, bogus: "yes" },
      },
    });

    expect(res.status).toBe(200);
    // The repo is already listed, so nothing is cloned; the item is not on disk, so it fails.
    expect(await res.json()).toMatchObject({
      reposAdded: 0,
      extensionsInstalled: 0,
      extensionsFailed: ["plugins/missing"],
    });

    const { extensions } = await exportSettings();
    expect(extensions.settings["example-slot"]).toEqual({ priority: "9" });
    expect(extensions.settings).not.toHaveProperty("__schemaVersion");
    expect(extensions.defaultEngines).toEqual({ "example-engine": true });
  });

  test("an empty engine map clears the overrides, an absent one leaves them", async () => {
    seedInstance();
    const withExtensions = (defaultEngines: unknown): unknown => ({
      kind: "degoog-settings",
      version: 1,
      settings: { acDebounceMs: "120" },
      extensions: { repos: [], installed: [], settings: {}, defaultEngines },
    });

    expect((await importBackup(withExtensions(undefined))).status).toBe(200);
    expect((await exportSettings()).extensions.defaultEngines).toEqual({
      "example-engine": false,
    });

    expect((await importBackup(withExtensions({}))).status).toBe(200);
    expect((await exportSettings()).extensions.defaultEngines).toEqual({});
  });

  test("import drops extension entries with an unknown type", async () => {
    seedInstance();

    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: { acDebounceMs: "120" },
      extensions: {
        repos: [REPO_URL],
        installed: [
          { repoUrl: REPO_URL, type: "malware", itemPath: "plugins/nope" },
        ],
        settings: {},
        defaultEngines: {},
      },
    });

    expect(await res.json()).toMatchObject({ extensionsFailed: [] });
  });

  test("export carries instance defaults, bang aliases and hand written shortcuts", async () => {
    seedExtras();
    await updateInstanceSettings({
      syncedDefaults: JSON.stringify({ theme: "dark", sticky_sidebar: true }),
      engineTabsOrder: ["web", "images"],
    });

    const body = await exportSettings();

    expect(body.instance.syncedDefaults).toEqual({
      theme: "dark",
      sticky_sidebar: true,
    });
    expect(body.instance.engineTabsOrder).toEqual(["web", "images"]);
    expect(body.aliases).toEqual({ gh: "github" });
    expect(body.shortcutSources).toEqual([
      { name: SHORTCUT_FILE, source: SHORTCUT_SOURCE },
    ]);
  });

  test("a round trip restores instance defaults, aliases and shortcuts", async () => {
    seedExtras();
    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: { acDebounceMs: "150" },
      instance: {
        syncedDefaults: { theme: "light", bogus: "nope" },
        engineTabsOrder: ["images", "web"],
      },
      aliases: { yt: "youtube" },
      shortcutSources: [{ name: "noon-shortcut.js", source: SHORTCUT_SOURCE }],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      instanceApplied: 2,
      aliasesRestored: 1,
      shortcutsRestored: 1,
      failedStages: [],
    });

    const body = await exportSettings();
    expect(body.instance.syncedDefaults).toEqual({ theme: "light" });
    expect(body.instance.engineTabsOrder).toEqual(["images", "web"]);
    expect(body.aliases).toEqual({ yt: "youtube" });
    expect(
      readFileSync(join(tempDir, "shortcuts", "noon-shortcut.js"), "utf-8"),
    ).toBe(SHORTCUT_SOURCE);
  });

  test("import refuses shortcut names that would escape the shortcuts folder", async () => {
    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: { acDebounceMs: "150" },
      shortcutSources: [
        { name: "../escaped.js", source: SHORTCUT_SOURCE },
        { name: "nested/deep.js", source: SHORTCUT_SOURCE },
        { name: "big-shortcut.js", source: "x".repeat(70_000) },
      ],
    });

    expect(await res.json()).toMatchObject({ shortcutsRestored: 0 });
    expect((await exportSettings()).shortcutSources).toEqual([]);
  });

  test("restoring shortcut bindings does not leave a stale cache behind", async () => {
    writeFileSync(
      join(tempDir, "plugin-settings.json"),
      JSON.stringify({ shortcuts: { "focus-shortcut": '{"key":"f"}' } }),
    );
    clearPluginSettingsCache();
    clearShortcutsSettingsCache();
    expect((await readShortcutsSettings()).bindings["focus-shortcut"]).toEqual({
      key: "f",
    });

    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: {},
      extensions: {
        repos: [],
        installed: [],
        settings: { shortcuts: { "focus-shortcut": '{"key":"g","ctrl":true}' } },
        defaultEngines: {},
      },
    });
    expect(res.status).toBe(200);

    expect((await readShortcutsSettings()).bindings["focus-shortcut"]).toEqual({
      key: "g",
      ctrl: true,
    });
  });

  test("import rejects a backup bigger than both ends agree on", async () => {
    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: { domainBlockList: "a".repeat(MAX_SETTINGS_BACKUP_BYTES) },
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "too-large" });
  });

  test("export refuses to hand out a file it could never take back", async () => {
    await updateInstanceSettings({ acDebounceMs: "450" });
    await writeDomainList(
      "domainBlockList",
      "a".repeat(MAX_SETTINGS_BACKUP_BYTES),
    );

    const res = await backupRouter.request(
      "http://localhost/api/settings/export",
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "too-large" });
  });

  test("a failed list write rolls the settings back and says so", async () => {
    await updateInstanceSettings({ acDebounceMs: "450" });
    process.env.DEGOOG_SEARCH_LISTS_FILE = join(tempDir, "blocked-as-a-folder");
    mkdirSync(process.env.DEGOOG_SEARCH_LISTS_FILE, { recursive: true });

    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: { acDebounceMs: "777", domainBlockList: "example.invalid" },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      code: "write-failed",
      failedStages: ["settings"],
    });
    expect((await getInstanceSettings()).acDebounceMs).toBe("450");
  });
});
