import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ExtensionStoreType } from "../../src/server/types/extension";
import type { StoreItem } from "../../src/server/types/store";

const REPO_URL = "https://example.com/acme/extensions.git";
const REPO_DIR = "acme-extensions";

let tempDir = "";
let previousDataDir: string | undefined;

type ManifestEntry = {
  path: string;
  name?: string;
  description?: string;
  version?: string;
  type?: string;
  minDegoogVersion?: string;
};

type InstalledRow = {
  repoUrl: string;
  type: ExtensionStoreType;
  itemPath: string;
  installedAs: string;
  version: string;
};

const newDataDir = (): void => {
  tempDir = mkdtempSync(join(tmpdir(), "degoog-list-items-"));
  previousDataDir = process.env.DEGOOG_DATA_DIR;
  process.env.DEGOOG_DATA_DIR = tempDir;
};

const writeManifest = (manifest: Record<string, unknown>): void => {
  const repoPath = join(tempDir, "store", REPO_DIR);
  mkdirSync(repoPath, { recursive: true });
  writeFileSync(
    join(repoPath, "package.json"),
    JSON.stringify(manifest, null, 2),
  );
};

const writeItem = (
  itemPath: string,
  files: Record<string, string> = {},
): string => {
  const dir = join(tempDir, "store", REPO_DIR, itemPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.js"), files["index.js"] ?? "export default {};");
  for (const [name, body] of Object.entries(files)) {
    if (name === "index.js") continue;
    const target = join(dir, name);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, body);
  }
  return dir;
};

const writeRepos = (installed: InstalledRow[] = []): void => {
  writeFileSync(
    join(tempDir, "repos.json"),
    JSON.stringify({
      repos: [
        {
          url: REPO_URL,
          localPath: REPO_DIR,
          addedAt: "",
          lastFetched: "",
          name: "Acme Extensions",
          description: "",
          error: null,
        },
      ],
      installed: installed.map((i) => ({ ...i, installedAt: "" })),
    }),
  );
};

const writeReposWith = (repoUrl: string, installed: InstalledRow[]): void => {
  writeFileSync(
    join(tempDir, "repos.json"),
    JSON.stringify({
      repos: [
        {
          url: repoUrl,
          localPath: REPO_DIR,
          addedAt: "",
          lastFetched: "",
          name: "Acme Extensions",
          description: "",
          error: null,
        },
      ],
      installed: installed.map((i) => ({ ...i, installedAt: "" })),
    }),
  );
};

const list = async (repoUrl?: string): Promise<StoreItem[]> => {
  const { listRepoItems } = await import(
    "../../src/server/extensions/store/item-catalog"
  );
  const { clearItemCachesForRepo } = await import(
    "../../src/server/extensions/store/item-metadata"
  );
  clearItemCachesForRepo(join(tempDir, "store", REPO_DIR));
  return listRepoItems(repoUrl);
};

const byPath = (items: StoreItem[], path: string): StoreItem | undefined =>
  items.find((i) => i.path === path);

beforeEach(() => {
  newDataDir();
});

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
  else process.env.DEGOOG_DATA_DIR = previousDataDir;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
  previousDataDir = undefined;
});

describe("listRepoItems catalogue assembly", () => {
  test("walks the manifest buckets in a fixed order", async () => {
    writeManifest({
      shortcuts: [{ path: "shortcuts/s", name: "S" }],
      engines: [{ path: "engines/e", name: "E" }],
      plugins: [{ path: "plugins/p", name: "P" }],
      themes: [{ path: "themes/t", name: "T" }],
      transports: [{ path: "transports/x", name: "X" }],
      autocomplete: [{ path: "autocomplete/a", name: "A" }],
    });
    for (const p of [
      "shortcuts/s",
      "engines/e",
      "plugins/p",
      "themes/t",
      "transports/x",
      "autocomplete/a",
    ])
      writeItem(p);
    writeRepos();

    const items = await list();
    expect(items.map((i) => i.type)).toEqual([
      ExtensionStoreType.Plugin,
      ExtensionStoreType.Theme,
      ExtensionStoreType.Engine,
      ExtensionStoreType.Transport,
      ExtensionStoreType.Autocomplete,
      ExtensionStoreType.Shortcut,
    ]);
  });

  test("a manifest entry with no directory on disk is skipped", async () => {
    writeManifest({ plugins: [{ path: "plugins/ghost", name: "Ghost" }] });
    writeRepos();

    expect(await list()).toEqual([]);
  });

  test("an unreadable package.json skips the repo without throwing", async () => {
    mkdirSync(join(tempDir, "store", REPO_DIR), { recursive: true });
    writeFileSync(join(tempDir, "store", REPO_DIR, "package.json"), "{ not json");
    writeRepos();

    expect(await list()).toEqual([]);
  });

  test("a trailing slash in the manifest path is trimmed", async () => {
    writeManifest({ plugins: [{ path: "plugins/p/", name: "P" }] });
    writeItem("plugins/p");
    writeRepos();

    expect((await list())[0].path).toBe("plugins/p");
  });

  test("a missing name falls back to the folder name", async () => {
    writeManifest({ plugins: [{ path: "plugins/nested/deep" }] });
    writeItem("plugins/nested/deep");
    writeRepos();

    const item = (await list())[0];
    expect(item.name).toBe("deep");
    expect(item.description).toBe("");
    expect(item.version).toBe("0.0.0");
  });
});

describe("listRepoItems author and screenshots", () => {
  test("an item author.json beats the top-level package author", async () => {
    writeManifest({
      author: "Top Author",
      plugins: [
        { path: "plugins/own", name: "Own" },
        { path: "plugins/inherit", name: "Inherit" },
      ],
    });
    writeItem("plugins/own", {
      "author.json": JSON.stringify({
        name: "Item Author",
        url: "https://item.test",
      }),
    });
    writeItem("plugins/inherit");
    writeRepos();

    const items = await list();
    expect(byPath(items, "plugins/own")?.author).toEqual({
      name: "Item Author",
      url: "https://item.test",
      avatar: undefined,
    });
    expect(byPath(items, "plugins/inherit")?.author).toEqual({
      name: "Top Author",
      url: undefined,
      avatar: undefined,
    });
  });

  test("an author.json without a name is ignored", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P" }] });
    writeItem("plugins/p", { "author.json": JSON.stringify({ url: "x" }) });
    writeRepos();

    expect((await list())[0].author).toBeNull();
  });

  test("only image files are listed as screenshots, sorted", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P" }] });
    const dir = writeItem("plugins/p");
    mkdirSync(join(dir, "screenshots"), { recursive: true });
    for (const f of ["b.png", "a.jpg", "notes.txt", "c.WEBP"])
      writeFileSync(join(dir, "screenshots", f), "x");
    writeRepos();

    expect((await list())[0].screenshots).toEqual(["a.jpg", "b.png", "c.WEBP"]);
  });
});

describe("listRepoItems installed and update state", () => {
  const installedRow = (version: string): InstalledRow => ({
    repoUrl: REPO_URL,
    type: ExtensionStoreType.Plugin,
    itemPath: "plugins/p",
    installedAs: "acme-extensions-p",
    version,
  });

  test("a matching version is installed with no update available", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P", version: "2.0.0" }] });
    writeItem("plugins/p");
    writeRepos([installedRow("2.0.0")]);

    const item = (await list())[0];
    expect(item.installed).toBe(true);
    expect(item.installedVersion).toBe("2.0.0");
    expect(item.updateAvailable).toBe(false);
  });

  test("any version difference counts as an update, in either direction", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P", version: "1.0.0" }] });
    writeItem("plugins/p");
    writeRepos([installedRow("9.9.9")]);

    expect((await list())[0].updateAvailable).toBe(true);
  });

  test("an uninstalled item reports no installed version", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P", version: "1.0.0" }] });
    writeItem("plugins/p");
    writeRepos();

    const item = (await list())[0];
    expect(item.installed).toBe(false);
    expect(item.installedVersion).toBeUndefined();
    expect(item.updateAvailable).toBe(false);
  });
});

describe("listRepoItems matches installs on the normalized repo url", () => {
  const BARE = "https://example.com/acme/extensions";
  const DOTGIT = `${BARE}.git`;

  const installedAt = (repoUrl: string): InstalledRow => ({
    repoUrl,
    type: ExtensionStoreType.Plugin,
    itemPath: "plugins/p",
    installedAs: "acme-extensions-p",
    version: "1.0.0",
  });

  test("a catalogue url without .git matches an install recorded with it", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P", version: "1.0.0" }] });
    writeItem("plugins/p");
    writeReposWith(BARE, [installedAt(DOTGIT)]);

    const item = (await list())[0];
    expect(item.installed).toBe(true);
    expect(item.installedVersion).toBe("1.0.0");
  });

  test("a catalogue url with .git matches an install recorded without it", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P", version: "1.0.0" }] });
    writeItem("plugins/p");
    writeReposWith(DOTGIT, [installedAt(BARE)]);

    const item = (await list())[0];
    expect(item.installed).toBe(true);
    expect(item.installedVersion).toBe("1.0.0");
  });

  test("a url variant install is not also reported as orphaned", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P", version: "1.0.0" }] });
    writeItem("plugins/p");
    writeReposWith(BARE, [installedAt(DOTGIT)]);

    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0].orphaned).toBeUndefined();
  });
});

describe("listRepoItems minDegoogVersion is advisory", () => {
  test("a version we cannot satisfy is flagged but still listed", async () => {
    writeManifest({
      plugins: [{ path: "plugins/p", name: "P", minDegoogVersion: "99.0.0" }],
    });
    writeItem("plugins/p");
    writeRepos();

    const item = (await list())[0];
    expect(item.minDegoogVersion).toBe("99.0.0");
    expect(item.requiresNewerVersion).toBe(true);
  });

  test("a satisfiable version is not flagged", async () => {
    writeManifest({
      plugins: [{ path: "plugins/p", name: "P", minDegoogVersion: "0.0.1" }],
    });
    writeItem("plugins/p");
    writeRepos();

    expect((await list())[0].requiresNewerVersion).toBe(false);
  });

  test("no declared minimum leaves both fields off the item", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P" }] });
    writeItem("plugins/p");
    writeRepos();

    const item = (await list())[0];
    expect("minDegoogVersion" in item).toBe(false);
    expect("requiresNewerVersion" in item).toBe(false);
  });
});

describe("listRepoItems engine types", () => {
  const engineManifest = (entry: ManifestEntry) =>
    writeManifest({ engines: [entry] });

  test("a manifest type list wins over the entry file", async () => {
    engineManifest({ path: "engines/e", name: "E", type: "images, videos" });
    writeItem("engines/e", {
      "index.js": 'export const type = "news";',
    });
    writeRepos();

    const item = (await list())[0];
    expect(item.engineTypes).toEqual(["images", "videos"]);
    expect(item.engineType).toBe("images");
  });

  test("with no manifest type the entry file is parsed", async () => {
    engineManifest({ path: "engines/e", name: "E" });
    writeItem("engines/e", {
      "index.js": 'export const type = ["news", "web"];',
    });
    writeRepos();

    expect((await list())[0].engineTypes).toEqual(["news", "web"]);
  });

  test("with neither the engine defaults to web", async () => {
    engineManifest({ path: "engines/e", name: "E" });
    writeItem("engines/e", { "index.js": "export default {};" });
    writeRepos();

    const item = (await list())[0];
    expect(item.engineTypes).toEqual(["web"]);
    expect(item.engineType).toBe("web");
  });
});

describe("listRepoItems source-scraped metadata", () => {
  test("needsAppRestart is read out of the entry source", async () => {
    writeManifest({
      plugins: [
        { path: "plugins/restart", name: "R" },
        { path: "plugins/quiet", name: "Q" },
      ],
    });
    writeItem("plugins/restart", {
      "index.js": "export const plugin = { needsAppRestart: true };",
    });
    writeItem("plugins/quiet", { "index.js": "export const plugin = {};" });
    writeRepos();

    const items = await list();
    expect(byPath(items, "plugins/restart")?.needsAppRestart).toBe(true);
    expect(byPath(items, "plugins/quiet")?.needsAppRestart).toBeUndefined();
  });

  test("a commented-out needsAppRestart does not count", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P" }] });
    writeItem("plugins/p", {
      "index.js": "// needsAppRestart: true\nexport default {};",
    });
    writeRepos();

    expect((await list())[0].needsAppRestart).toBeUndefined();
  });

  test("shortcut binding and kind are scraped from the entry source", async () => {
    writeManifest({ shortcuts: [{ path: "shortcuts/s", name: "S" }] });
    writeItem("shortcuts/s", {
      "index.js": [
        "export default {",
        '  kind: "numeric",',
        '  defaultBinding: { key: "j", ctrl: true },',
        "};",
      ].join("\n"),
    });
    writeRepos();

    const item = (await list())[0];
    expect(item.shortcutKind).toBe("numeric");
    expect(item.shortcutBinding).toMatchSnapshot();
  });
});

describe("listRepoItems orphaned and untracked entries", () => {
  test("an installed item missing from the catalogue is reported orphaned", async () => {
    writeManifest({ plugins: [] });
    writeRepos([
      {
        repoUrl: REPO_URL,
        type: ExtensionStoreType.Plugin,
        itemPath: "plugins/gone",
        installedAs: "acme-extensions-gone",
        version: "1.2.3",
      },
    ]);

    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      path: "plugins/gone",
      name: "gone",
      orphaned: true,
      installed: true,
      installedVersion: "1.2.3",
      repoName: "extensions",
    });
    expect(items[0].untracked).toBeUndefined();
  });

  test("an unmanaged folder on disk is reported untracked", async () => {
    writeManifest({ plugins: [] });
    writeRepos();
    mkdirSync(join(tempDir, "plugins", "hand-dropped"), { recursive: true });
    mkdirSync(join(tempDir, "plugins", ".hidden"), { recursive: true });

    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: ExtensionStoreType.Plugin,
      path: "hand-dropped",
      untracked: true,
      orphaned: true,
      repoUrl: "",
    });
  });

  test("a managed folder is not reported untracked", async () => {
    writeManifest({ plugins: [{ path: "plugins/p", name: "P" }] });
    writeItem("plugins/p");
    writeRepos([
      {
        repoUrl: REPO_URL,
        type: ExtensionStoreType.Plugin,
        itemPath: "plugins/p",
        installedAs: "managed-folder",
        version: "1.0.0",
      },
    ]);
    mkdirSync(join(tempDir, "plugins", "managed-folder"), { recursive: true });

    const items = await list();
    expect(items.filter((i) => i.untracked)).toEqual([]);
  });

  test("filtering to one repo suppresses orphaned and untracked scanning", async () => {
    writeManifest({ plugins: [] });
    writeRepos([
      {
        repoUrl: REPO_URL,
        type: ExtensionStoreType.Plugin,
        itemPath: "plugins/gone",
        installedAs: "acme-extensions-gone",
        version: "1.2.3",
      },
    ]);
    mkdirSync(join(tempDir, "plugins", "hand-dropped"), { recursive: true });

    expect(await list(REPO_URL)).toEqual([]);
  });
});
