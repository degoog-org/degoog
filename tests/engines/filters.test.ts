import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  initEngines,
  listEngines,
  honorsImageFilters,
} from "../../src/server/extensions/engines/registry";
import type { ImageFilter } from "../../src/server/types";

const writeEngine = async (
  root: string,
  folder: string,
  body: string,
): Promise<void> => {
  const dir = join(root, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.ts"), body);
};

describe("engine image filters declaration", () => {
  let dir: string;
  let prevEnv: string | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "degoog-filters-"));
    await writeEngine(
      dir,
      "withfilters",
      `export const type = "images";
export const filters = { color: ["red", "transparent"], nsfw: ["moderate"], junk: [] };
export default class { name = "WithFilters"; async executeSearch() { return []; } }
`,
    );
    await writeEngine(
      dir,
      "nofilters",
      `export const type = "images";
export default class { name = "NoFilters"; async executeSearch() { return []; } }
`,
    );
    prevEnv = process.env.DEGOOG_ENGINES_DIR;
    process.env.DEGOOG_ENGINES_DIR = dir;
    await initEngines(true);
  });

  afterAll(async () => {
    if (prevEnv !== undefined) process.env.DEGOOG_ENGINES_DIR = prevEnv;
    else delete process.env.DEGOOG_ENGINES_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  test("exposes declared filters and drops empty groups", async () => {
    const engines = await listEngines();
    const withFilters = engines.find((e) => e.displayName === "WithFilters");
    expect(withFilters?.filters).toEqual({
      color: ["red", "transparent"],
      nsfw: ["moderate"],
    });
  });

  test("engine without a filters export exposes no filters", async () => {
    const engines = await listEngines();
    const noFilters = engines.find((e) => e.displayName === "NoFilters");
    expect(noFilters).toBeDefined();
    expect(noFilters?.filters).toBeUndefined();
  });
});

describe("honorsImageFilters", () => {
  const filters = { color: ["red", "blue"], nsfw: ["on", "moderate", "off"] };
  const f = (o: Record<string, string>): boolean =>
    honorsImageFilters(filters, o as unknown as ImageFilter);
  const fNone = (o: Record<string, string>): boolean =>
    honorsImageFilters(undefined, o as unknown as ImageFilter);

  test("no active filters: any engine honors (even with none declared)", () => {
    expect(honorsImageFilters(undefined, undefined)).toBe(true);
    expect(fNone({ nsfw: "any" })).toBe(true);
    expect(fNone({})).toBe(true);
  });

  test("supported active value honors, unsupported does not", () => {
    expect(f({ color: "red" })).toBe(true);
    expect(f({ color: "green" })).toBe(false);
    expect(f({ nsfw: "on" })).toBe(true);
  });

  test("engine with no declared filters is excluded once any filter is active", () => {
    expect(fNone({ color: "red" })).toBe(false);
    expect(fNone({ nsfw: "on" })).toBe(false);
  });

  test("a group the engine does not declare excludes it", () => {
    expect(f({ size: "large" })).toBe(false);
    expect(f({ color: "red", size: "large" })).toBe(false);
  });
});
