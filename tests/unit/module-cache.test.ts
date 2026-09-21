import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { refreshModules } from "../../src/server/utils/module-cache";

let root: string;

const write = async (rel: string, body: string): Promise<void> => {
  const file = join(root, rel);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, body);
};

const load = async (
  rel: string,
  scopeRel: string,
  evict: boolean,
): Promise<Record<string, unknown>> => {
  const file = join(root, rel);
  await refreshModules(file, join(root, scopeRel), evict);
  return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "degoog-module-cache-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("utils/module-cache", () => {
  test("re-imports a changed extension together with its nested files", async () => {
    await write("changed/lib/helper.ts", "export const h = 'helper-old';");
    await write("changed/index.ts", "import { h } from './lib/helper.ts'; export const v = 'old'; export const helper = h;");
    await load("changed/index.ts", "changed", true);

    await write("changed/lib/helper.ts", "export const h = 'helper-new-longer';");
    await write("changed/index.ts", "import { h } from './lib/helper.ts'; export const v = 'new-longer'; export const helper = h;");
    const mod = await load("changed/index.ts", "changed", true);

    expect(mod.v).toBe("new-longer");
    expect(mod.helper).toBe("helper-new-longer");
  });

  test("keeps the same module instance when the entry did not change", async () => {
    await write("steady/index.ts", "export const widget = { id: 'steady' };");
    const first = await load("steady/index.ts", "steady", true);
    const second = await load("steady/index.ts", "steady", true);

    expect(second.widget).toBe(first.widget);
  });

  test("evicts on the first eviction pass after a skipped refresh", async () => {
    await write("deferred/index.ts", "export const v = 'old';");
    await load("deferred/index.ts", "deferred", true);

    await write("deferred/index.ts", "export const v = 'new-longer';");
    const skipped = await load("deferred/index.ts", "deferred", false);
    expect(skipped.v).toBe("old");

    const evicted = await load("deferred/index.ts", "deferred", true);
    expect(evicted.v).toBe("new-longer");
  });

  test("only evicts the changed flat file, not its siblings", async () => {
    await write("flat/one.ts", "export const widget = { v: 'one-old' };");
    await write("flat/two.ts", "export const widget = { v: 'two' };");
    await load("flat/one.ts", "flat/one.ts", true);
    const twoBefore = await load("flat/two.ts", "flat/two.ts", true);

    await write("flat/one.ts", "export const widget = { v: 'one-new-longer' };");
    const one = await load("flat/one.ts", "flat/one.ts", true);
    const twoAfter = await load("flat/two.ts", "flat/two.ts", true);

    expect((one.widget as { v: string }).v).toBe("one-new-longer");
    expect(twoAfter.widget).toBe(twoBefore.widget);
  });

  test("ignores entries that no longer exist", async () => {
    await expect(
      refreshModules(join(root, "missing/index.ts"), join(root, "missing"), true),
    ).resolves.toBeUndefined();
  });
});
