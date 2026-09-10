import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createRegistry } from "../../src/server/extensions/registry-factory";
import { getExtensionReadmePath } from "../../src/server/utils/extension-docs";

interface Widget {
  id: string;
}

describe("extension docs directory registration", () => {
  let dir: string;
  let folderPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "degoog-docs-"));
    folderPath = join(dir, "some-store-prefixed-folder");
    await mkdir(folderPath);
    await writeFile(
      join(folderPath, "index.ts"),
      `export const widget = { id: "renamed-by-manifest" };\n`,
    );
    await writeFile(join(folderPath, "README.md"), "# Docs\n");
    await writeFile(
      join(dir, "flat.ts"),
      `export const widget = { id: "flat-widget" };\n`,
    );

    const registry = createRegistry<Widget>({
      dirs: () => [{ dir }],
      match: (mod) => {
        const w = mod.widget as Widget | undefined;
        return w && typeof w.id === "string" ? w : null;
      },
      canonicalIdKind: "slot",
      allowFlatFiles: true,
      debugTag: "test-docs",
    });
    await registry.init();
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("resolves docs for an id that does not match its folder", () => {
    expect(getExtensionReadmePath("renamed-by-manifest")).toBe(
      join(folderPath, "README.md"),
    );
  });

  test("resolves docs under the canonical id too", () => {
    expect(getExtensionReadmePath("some-store-prefixed-folder-slot")).toBe(
      join(folderPath, "README.md"),
    );
  });

  test("leaves flat file extensions without a docs folder", () => {
    expect(getExtensionReadmePath("flat-widget")).toBeNull();
  });
});
