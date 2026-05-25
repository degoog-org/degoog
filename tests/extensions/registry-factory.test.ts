import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createRegistry } from "../../src/server/extensions/registry-factory";

interface Widget {
  id: string;
}

describe("registry-factory onLoad contract", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "degoog-reg-"));
    await writeFile(
      join(dir, "alpha.ts"),
      `export const widget = { id: "alpha" };\n`,
    );
    await writeFile(
      join(dir, "beta.ts"),
      `export const widget = { id: "beta" };\n`,
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const build = (onLoad?: (w: Widget) => Promise<void | false>) =>
    createRegistry<Widget>({
      dirs: () => [{ dir }],
      match: (mod) => {
        const w = mod.widget as Widget | undefined;
        return w && typeof w.id === "string" ? w : null;
      },
      onLoad: onLoad
        ? async (w) => onLoad(w)
        : undefined,
      allowFlatFiles: true,
      debugTag: "test-widgets",
    });

  test("adds all items when onLoad returns void", async () => {
    const reg = build(async () => undefined);
    await reg.init();
    const ids = reg.items().map((w) => w.id).sort();
    expect(ids).toEqual(["alpha", "beta"]);
  });

  test("skips item when onLoad returns false", async () => {
    const reg = build(async (w) => (w.id === "beta" ? false : undefined));
    await reg.init();
    const ids = reg.items().map((w) => w.id);
    expect(ids).toEqual(["alpha"]);
  });
});
