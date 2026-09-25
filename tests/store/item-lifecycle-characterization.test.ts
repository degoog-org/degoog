import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ExtensionStoreType } from "../../src/server/types/extension";
import {
  deleteUntracked,
  getInstalledItems,
  installItem,
  uninstallItem,
  updateItem,
} from "../../src/server/extensions/store/item-lifecycle";
import { settingsIdsForInstalled } from "../../src/server/extensions/store/item-specs";
import {
  clearRestartPending,
  getRestartState,
} from "../../src/server/utils/extension-support/restart-state";

const REPO_URL = "https://example.com/Acme/Extensions.git";
let tempDir = "";
let previousDataDir: string | undefined;

type InstalledRow = {
  repoUrl: string;
  type: string;
  itemPath: string;
  installedAs: string;
  version: string;
};

const seed = (manifest: Record<string, unknown>, installed: InstalledRow[] = []): void => {
  tempDir = mkdtempSync(join(tmpdir(), "degoog-item-life-"));
  previousDataDir = process.env.DEGOOG_DATA_DIR;
  process.env.DEGOOG_DATA_DIR = tempDir;

  const repoPath = join(tempDir, "store", "repo");
  mkdirSync(repoPath, { recursive: true });
  writeFileSync(join(repoPath, "package.json"), JSON.stringify(manifest));
  writeFileSync(
    join(tempDir, "repos.json"),
    JSON.stringify({
      repos: [
        {
          url: REPO_URL,
          localPath: "repo",
          addedAt: "",
          lastFetched: "",
          name: "Repo",
          description: "",
          error: null,
        },
      ],
      installed: installed.map((i) => ({ ...i, installedAt: "" })),
    }),
  );
};

const addSource = (itemPath: string, body = "export default {};"): void => {
  const dir = join(tempDir, "store", "repo", itemPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.js"), body);
};

const repos = (): { installed: InstalledRow[] } =>
  JSON.parse(readFileSync(join(tempDir, "repos.json"), "utf-8"));

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
  else process.env.DEGOOG_DATA_DIR = previousDataDir;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
  previousDataDir = undefined;
});

describe("installItem folder naming is the extension id contract", () => {
  const cases: [ExtensionStoreType, string, string][] = [
    [ExtensionStoreType.Plugin, "plugins", "acme-extensions-demo"],
    [ExtensionStoreType.Engine, "engines", "acme-extensions-demo"],
    [ExtensionStoreType.Transport, "transports", "acme-extensions-demo"],
    [ExtensionStoreType.Theme, "themes", "acme-extensions-demo-theme"],
    [
      ExtensionStoreType.Autocomplete,
      "autocomplete",
      "acme-extensions-demo-autocomplete",
    ],
    [
      ExtensionStoreType.Shortcut,
      "shortcuts",
      "acme-extensions-demo-shortcut",
    ],
  ];

  test.each(cases)(
    "%s installs as the slugified author-repo-item name",
    async (type, bucket, expectedFolder) => {
      seed({ [bucket]: [{ path: `${bucket}/demo`, name: "Demo", version: "1.0.0" }] });
      addSource(`${bucket}/demo`);

      await installItem(REPO_URL, `${bucket}/demo`, type);

      expect(repos().installed[0].installedAs).toBe(expectedFolder);
      expect(existsSync(join(tempDir, bucket, expectedFolder, "index.js"))).toBe(
        true,
      );
    },
  );
});

describe("installItem folder naming edge cases", () => {
  test("a repo url with spaces keeps its percent-encoding in the id", async () => {
    const spaced = "https://example.com/Acme Corp/My Extensions.git";
    tempDir = mkdtempSync(join(tmpdir(), "degoog-item-life-"));
    previousDataDir = process.env.DEGOOG_DATA_DIR;
    process.env.DEGOOG_DATA_DIR = tempDir;
    const repoPath = join(tempDir, "store", "repo");
    mkdirSync(repoPath, { recursive: true });
    writeFileSync(
      join(repoPath, "package.json"),
      JSON.stringify({
        plugins: [{ path: "plugins/demo", name: "Demo", version: "1.0.0" }],
      }),
    );
    writeFileSync(
      join(tempDir, "repos.json"),
      JSON.stringify({
        repos: [
          {
            url: spaced,
            localPath: "repo",
            addedAt: "",
            lastFetched: "",
            name: "Repo",
            description: "",
            error: null,
          },
        ],
        installed: [],
      }),
    );
    addSource("plugins/demo");

    await installItem(spaced, "plugins/demo", ExtensionStoreType.Plugin);

    expect(repos().installed[0].installedAs).toBe(
      "acme-20corp-my-20extensions-demo",
    );
  });

  test("an unparseable repo url falls back to unknown-repo", async () => {
    const broken = "not a url at all";
    tempDir = mkdtempSync(join(tmpdir(), "degoog-item-life-"));
    previousDataDir = process.env.DEGOOG_DATA_DIR;
    process.env.DEGOOG_DATA_DIR = tempDir;
    const repoPath = join(tempDir, "store", "repo");
    mkdirSync(repoPath, { recursive: true });
    writeFileSync(
      join(repoPath, "package.json"),
      JSON.stringify({
        plugins: [{ path: "plugins/demo", name: "Demo", version: "1.0.0" }],
      }),
    );
    writeFileSync(
      join(tempDir, "repos.json"),
      JSON.stringify({
        repos: [
          {
            url: broken,
            localPath: "repo",
            addedAt: "",
            lastFetched: "",
            name: "Repo",
            description: "",
            error: null,
          },
        ],
        installed: [],
      }),
    );
    addSource("plugins/demo");

    await installItem(broken, "plugins/demo", ExtensionStoreType.Plugin);

    expect(repos().installed[0].installedAs).toBe("unknown-repo-demo");
  });
});

describe("installItem bookkeeping", () => {
  test("the installed row records path, version and repo url", async () => {
    seed({ plugins: [{ path: "plugins/demo", name: "Demo", version: "3.1.4" }] });
    addSource("plugins/demo");

    await installItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin);

    const row = repos().installed[0];
    expect(row).toMatchObject({
      repoUrl: REPO_URL,
      type: ExtensionStoreType.Plugin,
      itemPath: "plugins/demo",
      version: "3.1.4",
    });
  });

  test("a manifest without a version records 0.0.0", async () => {
    seed({ plugins: [{ path: "plugins/demo", name: "Demo" }] });
    addSource("plugins/demo");

    await installItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin);

    expect(repos().installed[0].version).toBe("0.0.0");
  });

  test("installing an already-installed item is a no-op, not a duplicate", async () => {
    seed({ plugins: [{ path: "plugins/demo", name: "Demo", version: "1.0.0" }] });
    addSource("plugins/demo");

    await installItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin);
    await installItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin);

    expect(repos().installed).toHaveLength(1);
  });

  test("an item absent from package.json is refused", async () => {
    seed({ plugins: [] });
    addSource("plugins/demo");

    await expect(
      installItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin),
    ).rejects.toThrow("Item not listed in package.json.");
    expect(repos().installed).toEqual([]);
  });

  test("a destination folder that already exists is refused", async () => {
    seed({ plugins: [{ path: "plugins/demo", name: "Demo", version: "1.0.0" }] });
    addSource("plugins/demo");
    mkdirSync(join(tempDir, "plugins", "acme-extensions-demo"), {
      recursive: true,
    });

    await expect(
      installItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin),
    ).rejects.toThrow("already exists");
    expect(repos().installed).toEqual([]);
  });

  test("store metadata is not copied into the installed folder", async () => {
    seed({ plugins: [{ path: "plugins/demo", name: "Demo", version: "1.0.0" }] });
    addSource("plugins/demo");
    const src = join(tempDir, "store", "repo", "plugins", "demo");
    writeFileSync(join(src, "author.json"), JSON.stringify({ name: "A" }));
    mkdirSync(join(src, "screenshots"), { recursive: true });
    writeFileSync(join(src, "screenshots", "a.png"), "x");

    await installItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin);

    const dest = join(tempDir, "plugins", "acme-extensions-demo");
    expect(existsSync(join(dest, "index.js"))).toBe(true);
    expect(existsSync(join(dest, "author.json"))).toBe(false);
    expect(existsSync(join(dest, "screenshots"))).toBe(false);
  });
});

describe("uninstallItem", () => {
  test("removes the folder and the installed row", async () => {
    seed({ plugins: [{ path: "plugins/demo", name: "Demo", version: "1.0.0" }] });
    addSource("plugins/demo");
    await installItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin);
    const dest = join(tempDir, "plugins", "acme-extensions-demo");
    expect(existsSync(dest)).toBe(true);

    await uninstallItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin);

    expect(existsSync(dest)).toBe(false);
    expect(repos().installed).toEqual([]);
  });

  test("uninstalling something that is not installed is refused", async () => {
    seed({ plugins: [] });

    await expect(
      uninstallItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin),
    ).rejects.toThrow("Item is not installed.");
  });
});

describe("getInstalledItems", () => {
  test("returns the rows from repos.json", async () => {
    seed({ plugins: [] }, [
      {
        repoUrl: REPO_URL,
        type: ExtensionStoreType.Plugin,
        itemPath: "plugins/demo",
        installedAs: "acme-demo",
        version: "1.0.0",
      },
    ]);

    const items = await getInstalledItems();
    expect(items).toHaveLength(1);
    expect(items[0].installedAs).toBe("acme-demo");
  });
});

describe("settingsIdsForInstalled", () => {
  test("each type maps to its canonical settings ids", async () => {
    seed({ plugins: [] });

    const mapped = Object.values(ExtensionStoreType).map((type) => [
      type,
      settingsIdsForInstalled(type, "acme-demo"),
    ]);
    expect(Object.fromEntries(mapped)).toMatchSnapshot();
  });
});

describe("deleteUntracked", () => {
  test("removes a folder that sits directly under the type directory", async () => {
    seed({ plugins: [] });
    const target = join(tempDir, "plugins", "hand-dropped");
    mkdirSync(target, { recursive: true });

    await deleteUntracked(ExtensionStoreType.Plugin, "hand-dropped");

    expect(existsSync(target)).toBe(false);
  });

  test("a folder name that escapes the type directory is refused", async () => {
    seed({ plugins: [] });
    const outside = join(tempDir, "outside");
    mkdirSync(outside, { recursive: true });

    await expect(
      deleteUntracked(ExtensionStoreType.Plugin, "../outside"),
    ).rejects.toThrow("Invalid folder name.");
    expect(existsSync(outside)).toBe(true);
  });

  test("an empty folder name is refused", async () => {
    seed({ plugins: [] });

    await expect(
      deleteUntracked(ExtensionStoreType.Plugin, ""),
    ).rejects.toThrow("Invalid folder name.");
  });
});

describe("lifecycle guards and restart bookkeeping", () => {
  test("an item listed in package.json but missing on disk is refused", async () => {
    seed({ plugins: [{ path: "plugins/ghost", name: "Ghost" }] });

    await expect(
      installItem(REPO_URL, "plugins/ghost", ExtensionStoreType.Plugin),
    ).rejects.toThrow("Item path not found in repository.");
    expect(repos().installed).toEqual([]);
  });

  test("updating an item whose source vanished is refused", async () => {
    seed({ plugins: [{ path: "plugins/demo", name: "Demo" }] }, [
      {
        repoUrl: REPO_URL,
        type: ExtensionStoreType.Plugin,
        itemPath: "plugins/demo",
        installedAs: "acme-extensions-demo",
        version: "1.0.0",
      },
    ]);

    await expect(
      updateItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin),
    ).rejects.toThrow("Item path not found in repository.");
  });

  test("an installed row only matches its own type", async () => {
    seed({ plugins: [] }, [
      {
        repoUrl: REPO_URL,
        type: ExtensionStoreType.Theme,
        itemPath: "plugins/demo",
        installedAs: "acme-extensions-demo-theme",
        version: "1.0.0",
      },
    ]);

    await expect(
      uninstallItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin),
    ).rejects.toThrow("Item is not installed.");
    await expect(
      updateItem(REPO_URL, "plugins/demo", ExtensionStoreType.Plugin),
    ).rejects.toThrow("Item is not installed.");
    expect(repos().installed).toHaveLength(1);
  });

  test("install and update flag a restart when the entry asks for one", async () => {
    clearRestartPending();
    seed({ plugins: [{ path: "plugins/heavy", name: "Heavy", version: "1.0.0" }] });
    addSource("plugins/heavy", "export const needsAppRestart = true;");

    await installItem(REPO_URL, "plugins/heavy", ExtensionStoreType.Plugin);
    expect(getRestartState()).toEqual({
      pending: true,
      reasons: ['plugin "Heavy" was installed'],
    });

    await updateItem(REPO_URL, "plugins/heavy", ExtensionStoreType.Plugin);
    expect(getRestartState().reasons).toEqual([
      'plugin "Heavy" was installed',
      'plugin "Heavy" was updated',
    ]);
    clearRestartPending();
  });

  test("an entry without the flag leaves the restart state alone", async () => {
    clearRestartPending();
    seed({ plugins: [{ path: "plugins/light", name: "Light" }] });
    addSource("plugins/light");

    await installItem(REPO_URL, "plugins/light", ExtensionStoreType.Plugin);
    expect(getRestartState()).toEqual({ pending: false, reasons: [] });
  });
});
