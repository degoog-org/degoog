import { describe, test, expect } from "bun:test";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readNeedsAppRestart } from "../../src/server/extensions/store/item-ops";

const withTempExtensionDir = async (
  source: string,
  run: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "degoog-needs-restart-"));
  try {
    await writeFile(join(dir, "index.js"), source, "utf-8");
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe("readNeedsAppRestart", () => {
  test("detects a flat exported const", async () => {
    await withTempExtensionDir(
      `export const needsAppRestart = true;\nexport const name = "acme";\n`,
      async (dir) => {
        expect(await readNeedsAppRestart(dir)).toBe(true);
      },
    );
  });

  test("detects the flag as an object property", async () => {
    await withTempExtensionDir(
      `export default { name: "acme", needsAppRestart: true };\n`,
      async (dir) => {
        expect(await readNeedsAppRestart(dir)).toBe(true);
      },
    );
  });

  test("returns false when the flag is absent", async () => {
    await withTempExtensionDir(
      `export const name = "acme";\n`,
      async (dir) => {
        expect(await readNeedsAppRestart(dir)).toBe(false);
      },
    );
  });

  test("returns false when the flag is explicitly false", async () => {
    await withTempExtensionDir(
      `export const needsAppRestart = false;\n`,
      async (dir) => {
        expect(await readNeedsAppRestart(dir)).toBe(false);
      },
    );
  });

  test("returns false for a directory with no index file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "degoog-needs-restart-empty-"));
    try {
      expect(await readNeedsAppRestart(dir)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
