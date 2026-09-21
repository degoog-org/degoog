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

const CASES: [string, string, boolean][] = [
  [
    "a flat exported const",
    `export const needsAppRestart = true;\nexport const name = "acme";\n`,
    true,
  ],
  [
    "the flag as an object property",
    `export default { name: "acme", needsAppRestart: true };\n`,
    true,
  ],
  ["an absent flag", `export const name = "acme";\n`, false],
  ["an explicitly false flag", `export const needsAppRestart = false;\n`, false],
];

describe("readNeedsAppRestart", () => {
  for (const [label, source, expected] of CASES) {
    test(`reads ${label}`, async () => {
      await withTempExtensionDir(source, async (dir) => {
        expect(await readNeedsAppRestart(dir)).toBe(expected);
      });
    });
  }

  test("returns false for a directory with no index file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "degoog-needs-restart-empty-"));
    try {
      expect(await readNeedsAppRestart(dir)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
