import { describe, test, expect } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runConsolidated052028 } from "../../src/server/migrations/2026-05-canonical-ids-migration";
import { ExtensionStoreType, type ReposData } from "../../src/server/types";

const reposFixture = (): ReposData => ({
  repos: [
    {
      url: "https://github.com/degoog-org/official-extensions.git",
      localPath: "degoog-org-official-extensions",
      addedAt: "",
      lastFetched: "",
      name: "official",
      description: "",
      error: null,
    },
    {
      url: "https://github.com/TheAnnoying/theannoying-degoog-extensions.git",
      localPath: "TheAnnoying-theannoying-degoog-extensions",
      addedAt: "",
      lastFetched: "",
      name: "annoying",
      description: "",
      error: null,
    },
    {
      url: "https://codeberg.org/fccview/degoog-weeb-paradise.git",
      localPath: "fccview-degoog-weeb-paradise",
      addedAt: "",
      lastFetched: "",
      name: "weeb",
      description: "",
      error: null,
    },
    {
      url: "https://codeberg.org/Georgvwt/georgvwt-degoog-stuff.git",
      localPath: "Georgvwt-georgvwt-degoog-stuff",
      addedAt: "",
      lastFetched: "",
      name: "georg",
      description: "",
      error: null,
    },
  ],
  installed: [
    {
      repoUrl: "https://github.com/degoog-org/official-extensions.git",
      type: ExtensionStoreType.Theme,
      itemPath: "themes/zen",
      installedAs: "zen",
      installedAt: "",
      version: "1.0.0",
    },
    {
      repoUrl: "https://github.com/degoog-org/official-extensions.git",
      type: ExtensionStoreType.Autocomplete,
      itemPath: "autocomplete/bing",
      installedAs: "degoog-org-official-extensions-bing",
      installedAt: "",
      version: "1.0.0",
    },
  ],
});

const writePackage = (dir: string, localPath: string, pkg: unknown): void => {
  const repoDir = join(dir, "store", localPath);
  mkdirSync(repoDir, { recursive: true });
  writeFileSync(join(repoDir, "package.json"), JSON.stringify(pkg, null, 2));
};

const writeRepoPackages = (dir: string): void => {
  writePackage(dir, "degoog-org-official-extensions", {
    themes: [
      { path: "themes/degoog-docs", name: "Degoog Docs" },
      { path: "themes/zen", name: "Zen" },
      { path: "themes/catpuccin", name: "Catppuccin" },
      { path: "themes/pokemon", name: "Pokemon" },
    ],
    autocomplete: [
      { path: "autocomplete/bing", name: "Bing" },
      { path: "autocomplete/yahoo", name: "Yahoo" },
    ],
  });
  writePackage(dir, "TheAnnoying-theannoying-degoog-extensions", {
    themes: [{ path: "themes/LiterallyGoogle", name: "Literally Google" }],
  });
  writePackage(dir, "fccview-degoog-weeb-paradise", {
    themes: [{ path: "themes/satan", name: "Satan" }],
  });
  writePackage(dir, "Georgvwt-georgvwt-degoog-stuff", {
    themes: [{ path: "themes/everforest", name: "Everforest" }],
  });
};

const withMigration = async (
  settings: Record<string, unknown>,
  setup?: (dir: string) => void,
): Promise<{ settings: Record<string, unknown>; dir: string; cleanup: () => void }> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-theme-transport-ids-"));
  const settingsFile = join(dir, "plugin-settings.json");
  const prevDataDir = process.env.DEGOOG_DATA_DIR;
  const prevSettings = process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = settingsFile;
  mkdirSync(dir, { recursive: true });
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  writeFileSync(join(dir, "repos.json"), JSON.stringify(reposFixture(), null, 2));
  writeRepoPackages(dir);
  setup?.(dir);
  await runConsolidated052028();
  const cleanup = (): void => {
    if (prevDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = prevDataDir;
    if (prevSettings === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
    else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prevSettings;
    rmSync(dir, { recursive: true, force: true });
  };
  return {
    settings: JSON.parse(readFileSync(settingsFile, "utf-8")) as Record<
      string,
      unknown
    >,
    dir,
    cleanup,
  };
};

describe("theme-transport-ids migration", () => {
  test("moves transport runtime keys to canonical -transport keys", async () => {
    const out = await withMigration({
      "transport-acme-proxy-transport": { token: "secret" },
    });
    try {
      expect(out.settings["acme-proxy-transport"]).toEqual({ token: "secret" });
      expect(out.settings["transport-acme-proxy-transport"]).toBeUndefined();
    } finally {
      out.cleanup();
    }
  });

  test("moves local theme settings and active id to repo-canonical ids", async () => {
    const out = await withMigration({
      "theme-catpuccin": { flavor: "mocha" },
      "theme-degoog-docs": { enabled: "true" },
      "theme-fccview-degoog-weeb-paradise-satan": { enabled: "true" },
      "theme-georgvwt-georgvwt-degoog-stuff-everforest": { tone: "hard" },
      "theme-LiterallyGoogle": { enabled: "true" },
      "theme-pokemon": { flavor: "pikachu" },
      "theme-zen": { enabled: "true" },
      theme: { active: "catpuccin" },
    });
    try {
      expect(out.settings["degoog-org-official-extensions-catpuccin-theme"]).toEqual({ flavor: "mocha" });
      expect(out.settings["degoog-org-official-extensions-degoog-docs-theme"]).toEqual({ enabled: "true" });
      expect(out.settings["fccview-degoog-weeb-paradise-satan-theme"]).toEqual({ enabled: "true" });
      expect(out.settings["georgvwt-georgvwt-degoog-stuff-everforest-theme"]).toEqual({ tone: "hard" });
      expect(out.settings["theannoying-theannoying-degoog-extensions-literallygoogle-theme"]).toEqual({ enabled: "true" });
      expect(out.settings["degoog-org-official-extensions-pokemon-theme"]).toEqual({ flavor: "pikachu" });
      expect(out.settings["degoog-org-official-extensions-zen-theme"]).toEqual({ enabled: "true" });
      expect(out.settings.theme).toEqual({
        active: "degoog-org-official-extensions-catpuccin-theme",
      });
    } finally {
      out.cleanup();
    }
  });

  test("renames theme and autocomplete folders to canonical ids", async () => {
    const out = await withMigration({}, (dir) => {
      for (const folder of [
        "catpuccin",
        "degoog-docs",
        "fccview-degoog-weeb-paradise-satan",
        "georgvwt-georgvwt-degoog-stuff-everforest",
        "LiterallyGoogle",
        "pokemon",
        "zen",
      ]) {
        mkdirSync(join(dir, "themes", folder), { recursive: true });
      }
      mkdirSync(join(dir, "autocomplete", "degoog-org-official-extensions-bing"), { recursive: true });
    });
    try {
      expect(existsSync(join(out.dir, "themes", "degoog-org-official-extensions-catpuccin-theme"))).toBe(true);
      expect(existsSync(join(out.dir, "themes", "degoog-org-official-extensions-degoog-docs-theme"))).toBe(true);
      expect(existsSync(join(out.dir, "themes", "fccview-degoog-weeb-paradise-satan-theme"))).toBe(true);
      expect(existsSync(join(out.dir, "themes", "georgvwt-georgvwt-degoog-stuff-everforest-theme"))).toBe(true);
      expect(existsSync(join(out.dir, "themes", "theannoying-theannoying-degoog-extensions-literallygoogle-theme"))).toBe(true);
      expect(existsSync(join(out.dir, "themes", "degoog-org-official-extensions-pokemon-theme"))).toBe(true);
      expect(existsSync(join(out.dir, "themes", "degoog-org-official-extensions-zen-theme"))).toBe(true);
      expect(existsSync(join(out.dir, "autocomplete", "degoog-org-official-extensions-bing-autocomplete"))).toBe(true);
    } finally {
      out.cleanup();
    }
  });

  test("syncs repos.json installedAs for themes and autocomplete", async () => {
    const out = await withMigration({});
    try {
      const repos = JSON.parse(
        readFileSync(join(out.dir, "repos.json"), "utf-8"),
      ) as ReposData;
      expect(repos.installed[0]?.installedAs).toBe(
        "degoog-org-official-extensions-zen-theme",
      );
      expect(repos.installed[1]?.installedAs).toBe(
        "degoog-org-official-extensions-bing-autocomplete",
      );
    } finally {
      out.cleanup();
    }
  });

  test("moves legacy autocomplete keys to canonical -autocomplete keys", async () => {
    const out = await withMigration({
      "autocomplete-degoog-org-official-extensions-bing": { disabled: "true" },
      "degoog-org-official-extensions-yahoo-autocomplete": { score: "2" },
      "autocomplete-yahoo": { score: "1", disabled: "true" },
    });
    try {
      expect(out.settings["degoog-org-official-extensions-bing-autocomplete"]).toEqual({ disabled: "true" });
      expect(out.settings["autocomplete-degoog-org-official-extensions-bing"]).toBeUndefined();
      expect(out.settings["degoog-org-official-extensions-yahoo-autocomplete"]).toEqual({
        score: "2",
        disabled: "true",
      });
    } finally {
      out.cleanup();
    }
  });

  test("is idempotent and stamps the schema version", async () => {
    const first = await withMigration({
      "transport-acme-proxy": { host: "h" },
      "theme-acme-zen": { flavor: "dark" },
    });
    try {
      expect(first.settings["acme-proxy-transport"]).toEqual({ host: "h" });
      expect(first.settings["acme-zen-theme"]).toEqual({ flavor: "dark" });
      expect(first.settings.__schemaVersion).toBe(52028);

      writeFileSync(
        join(first.dir, "plugin-settings.json"),
        JSON.stringify(first.settings, null, 2),
      );
      await runConsolidated052028();
      const second = JSON.parse(
        readFileSync(join(first.dir, "plugin-settings.json"), "utf-8"),
      ) as Record<string, unknown>;
      expect(second["acme-proxy-transport"]).toEqual({ host: "h" });
      expect(second["acme-zen-theme"]).toEqual({ flavor: "dark" });
      expect(second["transport-acme-proxy"]).toBeUndefined();
      expect(second["theme-acme-zen"]).toBeUndefined();
    } finally {
      first.cleanup();
    }
  });

  test("existing canonical values win when both keys exist", async () => {
    const out = await withMigration({
      "transport-acme-proxy-transport": { token: "legacy", host: "legacy" },
      "acme-proxy-transport": { token: "current" },
      "theme-acme-zen": { flavor: "legacy", extra: "legacy" },
      "acme-zen-theme": { flavor: "current" },
    });
    try {
      expect(out.settings["acme-proxy-transport"]).toEqual({
        token: "current",
        host: "legacy",
      });
      expect(out.settings["acme-zen-theme"]).toEqual({
        flavor: "current",
        extra: "legacy",
      });
    } finally {
      out.cleanup();
    }
  });
});
