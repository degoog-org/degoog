import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { installItem } from "../../src/server/extensions/store/item-ops";
import { ExtensionStoreType } from "../../src/server/types";

const repoUrl = "https://example.com/acme/repo.git";
let tempDir: string | null = null;
let previousDataDir: string | undefined;

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
  else process.env.DEGOOG_DATA_DIR = previousDataDir;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  previousDataDir = undefined;
});

describe("installItem path containment", () => {
  test("rejects a manifest item path that resolves outside the repository", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "degoog-store-paths-"));
    previousDataDir = process.env.DEGOOG_DATA_DIR;
    process.env.DEGOOG_DATA_DIR = tempDir;

    const repoDir = join(tempDir, "store", "repo");
    const outsideDir = join(tempDir, "outside");
    mkdirSync(join(repoDir, "engines"), { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, "index.js"), "export default {};");
    symlinkSync(outsideDir, join(repoDir, "engines", "escape"));
    writeFileSync(
      join(repoDir, "package.json"),
      JSON.stringify({
        engines: [{ path: "engines/escape", name: "Escape", version: "1.0.0" }],
      }),
    );
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
        installed: [],
      }),
    );

    await expect(
      installItem(repoUrl, "engines/escape", ExtensionStoreType.Engine),
    ).rejects.toThrow("Invalid item path.");
  });
});
