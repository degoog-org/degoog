import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runCanonicalIdsMigration052028 } from "../../src/server/migrations/2026-05-canonical-ids-migration";
import { ExtensionStoreType, type ReposData } from "../../src/server/types";

type MigrationResult = {
  settings: Record<string, unknown>;
  repos: ReposData;
};

const withMigration = async (
  settings: Record<string, unknown>,
  repos: ReposData = { repos: [], installed: [] },
): Promise<MigrationResult> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-cmd-ids-"));
  const settingsFile = join(dir, "plugin-settings.json");
  const reposFile = join(dir, "repos.json");
  const prevDataDir = process.env.DEGOOG_DATA_DIR;
  const prevSettings = process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = settingsFile;
  try {
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    writeFileSync(reposFile, JSON.stringify(repos, null, 2));
    await runCanonicalIdsMigration052028();
    return {
      settings: JSON.parse(readFileSync(settingsFile, "utf-8")) as Record<
        string,
        unknown
      >,
      repos: JSON.parse(readFileSync(reposFile, "utf-8")) as ReposData,
    };
  } finally {
    if (prevDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = prevDataDir;
    if (prevSettings === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
    else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prevSettings;
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("command-ids migration", () => {
  test("moves plugin-<folder> keys to <folder>-command", async () => {
    const { settings: out } = await withMigration({
      "plugin-degoog-org-official-extensions-meilisearch": { host: "h" },
      "some-engine": { enabled: "true" },
    });
    expect(out["degoog-org-official-extensions-meilisearch-command"]).toEqual({
      host: "h",
    });
    expect(
      out["plugin-degoog-org-official-extensions-meilisearch"],
    ).toBeUndefined();
    expect(out["some-engine"]).toEqual({ enabled: "true" });
  });

  test("rewrites stale installedAs in repos.json to canonical folder names", async () => {
    const { repos } = await withMigration(
      { __schemaVersion: 52027 },
      {
        repos: [],
        installed: [
          {
            repoUrl: "https://github.com/degoog-org/official-extensions.git",
            type: ExtensionStoreType.Plugin,
            itemPath: "plugins/jellyfin",
            installedAs: "jellyfin",
            installedAt: "2026-03-11T22:52:45.011Z",
            version: "1.4.2",
          },
          {
            repoUrl: "https://github.com/degoog-org/official-extensions.git",
            type: ExtensionStoreType.Engine,
            itemPath: "engines/lemmy",
            installedAs: "lemmy",
            installedAt: "2026-03-13T17:06:50.206Z",
            version: "1.0.3",
          },
        ],
      },
    );
    expect(repos.installed[0]?.installedAs).toBe(
      "degoog-org-official-extensions-jellyfin",
    );
    expect(repos.installed[1]?.installedAs).toBe(
      "degoog-org-official-extensions-lemmy",
    );
  });
});
