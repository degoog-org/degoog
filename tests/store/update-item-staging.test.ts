import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { updateItem } from "../../src/server/extensions/store/item-ops";
import { ExtensionStoreType } from "../../src/server/types";

const DIR_LINK_TYPE = process.platform === "win32" ? "junction" : "dir";

const linkDir = (target: string, path: string): void =>
  symlinkSync(target, path, DIR_LINK_TYPE);

const repoUrl = "https://example.com/acme/repo.git";
const installedAs = "acme-repo-demo";

let tempDir: string | null = null;
let previousDataDir: string | undefined;

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
  else process.env.DEGOOG_DATA_DIR = previousDataDir;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  previousDataDir = undefined;
});

const seedDataDir = (): { repoItemDir: string; installedDir: string } => {
  tempDir = mkdtempSync(join(tmpdir(), "degoog-store-update-"));
  previousDataDir = process.env.DEGOOG_DATA_DIR;
  process.env.DEGOOG_DATA_DIR = tempDir;

  const repoItemDir = join(tempDir, "store", "repo", "engines", "demo");
  mkdirSync(repoItemDir, { recursive: true });
  writeFileSync(join(repoItemDir, "index.js"), "export const version = 2;");
  writeFileSync(
    join(tempDir, "store", "repo", "package.json"),
    JSON.stringify({
      engines: [{ path: "engines/demo", name: "Demo", version: "2.0.0" }],
    }),
  );

  const installedDir = join(tempDir, "engines", installedAs);
  mkdirSync(installedDir, { recursive: true });
  writeFileSync(join(installedDir, "index.js"), "export const version = 1;");

  writeFileSync(
    join(tempDir, "repos.json"),
    JSON.stringify({
      repos: [
        {
          url: repoUrl,
          localPath: "repo",
          addedAt: "",
          lastFetched: "",
          name: "Repo",
          description: "",
          error: null,
        },
      ],
      installed: [
        {
          repoUrl,
          type: ExtensionStoreType.Engine,
          itemPath: "engines/demo",
          installedAs,
          installedAt: "",
          version: "1.0.0",
        },
      ],
    }),
  );

  return { repoItemDir, installedDir };
};

const readReposJson = (): { installed: { version: string }[] } =>
  JSON.parse(readFileSync(join(tempDir!, "repos.json"), "utf-8"));

describe("updateItem staging", () => {
  test("keeps the installed copy when the source contains a nested symlink", async () => {
    const { repoItemDir, installedDir } = seedDataDir();
    mkdirSync(join(repoItemDir, "assets"));
    linkDir(tempDir!, join(repoItemDir, "assets", "escape"));

    await expect(
      updateItem(repoUrl, "engines/demo", ExtensionStoreType.Engine),
    ).rejects.toThrow("Symlinked store entries are not supported.");

    expect(readFileSync(join(installedDir, "index.js"), "utf-8")).toBe(
      "export const version = 1;",
    );
    expect(readReposJson().installed[0].version).toBe("1.0.0");
    expect(
      readdirSync(join(tempDir!, "engines")).filter((e) =>
        e.startsWith(".staging-"),
      ),
    ).toEqual([]);
  });

  test("swaps in the new contents on a successful update", async () => {
    const { installedDir } = seedDataDir();

    await updateItem(repoUrl, "engines/demo", ExtensionStoreType.Engine);

    expect(readFileSync(join(installedDir, "index.js"), "utf-8")).toBe(
      "export const version = 2;",
    );
    expect(readReposJson().installed[0].version).toBe("2.0.0");
    expect(readdirSync(join(tempDir!, "engines"))).toEqual([installedAs]);
  });
});
