import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { listEngines } from "../../src/server/extensions/engines/catalog";
import { initEngines } from "../../src/server/extensions/engines/loader";

const writeEngine = async (root: string, folder: string, body: string): Promise<void> => {
  const dir = join(root, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.js"), body);
};

describe("engine declared regions", () => {
  let dir: string;
  let prevEnv: string | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "degoog-regions-"));
    await writeEngine(
      dir,
      "regional",
      `export const regions = ["us", "GB", "GB", "gbr", 12, "", " fr "];
export default class { name = "Regional"; async executeSearch() { return []; } }
`,
    );
    await writeEngine(
      dir,
      "split",
      `export { regions } from "./const/regions.js";
export default class { name = "Split"; async executeSearch() { return []; } }
`,
    );
    await mkdir(join(dir, "split", "const"), { recursive: true });
    await writeFile(join(dir, "split", "const", "regions.js"), `export const regions = ["DE", "AT"];\n`);
    await writeEngine(
      dir,
      "global",
      `export const regions = "GB";
export default class { name = "Global"; async executeSearch() { return []; } }
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

  test("declared regions are uppercased, deduped and sorted, junk is dropped, and split engine folders resolve", async () => {
    const engines = await listEngines();
    expect(engines.find((e) => e.displayName === "Regional")?.regions).toEqual(["FR", "GB", "US"]);
    expect(engines.find((e) => e.displayName === "Split")?.regions).toEqual(["AT", "DE"]);
    expect(engines.find((e) => e.displayName === "Global")?.regions).toBeUndefined();
  });
});
