import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { listEngines } from "../../src/server/extensions/engines/catalog";
import { initEngines } from "../../src/server/extensions/engines/loader";
import { selectActiveEngines } from "../../src/server/search/engine-selection";
import { searchSingleEngine } from "../../src/server/search";
import { runKey } from "../../src/server/search/engine-cache";
import { hasSearchInput, parseSearchImage } from "../../src/server/search/search-image";
import { queryImage, type ImageQueryProvider } from "../../src/server/search/image-query";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const writeEngine = async (root: string, folder: string, body: string): Promise<void> => {
  const dir = join(root, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.ts"), body);
};

describe("engine input type", () => {
  let dir: string;
  let prevEnv: string | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "degoog-input-"));
    await writeEngine(
      dir,
      "lookalike",
      `export const type = "images";
export const input = "image";
export default class {
  name = "Lookalike";
  async executeSearch(query, _page, _time, ctx) {
    return [{ title: "seen " + ctx.image.bytes.length + " " + ctx.image.mime + " q=" + query, url: "https://example.com/a", snippet: "", source: "Lookalike" }];
  }
}
`,
    );
    await writeEngine(
      dir,
      "wordy",
      `export const type = "images";
export default class {
  name = "Wordy";
  async executeSearch(query, _page, _time, ctx) {
    return [{ title: "words " + query + " image=" + String(!!ctx.image), url: "https://example.com/b", snippet: "", source: "Wordy" }];
  }
}
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

  const idOf = async (name: string): Promise<string> =>
    (await listEngines()).find((e) => e.displayName === name)!.id;

  test("the registry says which engines take an image and defaults the rest to text", async () => {
    const engines = await listEngines();
    expect(engines.find((e) => e.displayName === "Lookalike")?.input).toBe("image");
    expect(engines.find((e) => e.displayName === "Wordy")?.input).toBe("text");
  });

  const ours = (names: string[]): string[] =>
    names.filter((name) => name === "Lookalike" || name === "Wordy");

  test("a text search never runs an image engine", async () => {
    const config = { [await idOf("Lookalike")]: true, [await idOf("Wordy")]: true };
    const active = await selectActiveEngines("images", config);
    expect(ours(active.map((e) => e.instance.name))).toEqual(["Wordy"]);
  });

  test("an image search runs image engines, and text engines only with a generated query", async () => {
    const config = { [await idOf("Lookalike")]: true, [await idOf("Wordy")]: true };
    const image = parseSearchImage(PNG_1PX)!;
    const names = async (imageQuery?: string): Promise<string[]> =>
      ours(
        (await selectActiveEngines("images", config, undefined, { image, imageQuery })).map(
          (e) => e.instance.name,
        ),
      );
    expect(await names()).toEqual(["Lookalike"]);
    expect((await names("a red bicycle")).sort()).toEqual(["Lookalike", "Wordy"]);
  });

  test("an image engine gets the image on its context and the typed words as the query", async () => {
    const image = parseSearchImage(`data:image/png;base64,${PNG_1PX}`)!;
    const run = await searchSingleEngine(
      await idOf("Lookalike"),
      "red",
      1,
      "any",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "images",
      { image, forceFresh: true },
    );
    expect(run.results[0]?.title).toBe(`seen ${image.bytes.length} image/png q=red`);
  });

  test("an image engine without an image returns nothing instead of running", async () => {
    const run = await searchSingleEngine(await idOf("Lookalike"), "red", 1, "any");
    expect(run.results).toEqual([]);
    expect(run.timing.status).toBe("ok");
  });

  test("a text engine never receives the image", async () => {
    const image = parseSearchImage(PNG_1PX)!;
    const run = await searchSingleEngine(
      await idOf("Wordy"),
      "bike",
      1,
      "any",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "images",
      { image, forceFresh: true },
    );
    expect(run.results[0]?.title).toBe("words bike image=false");
  });

  test("a text engine in an image search without a generated query does not run", async () => {
    const image = parseSearchImage(PNG_1PX)!;
    const run = await searchSingleEngine(
      await idOf("Wordy"),
      "",
      1,
      "any",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "images",
      { image, forceFresh: true },
    );
    expect(run.results).toEqual([]);
    expect(run.timing.errorReason).toBeTruthy();
  });

  test("the run cache key separates images", async () => {
    const id = await idOf("Lookalike");
    const scope = { query: "", type: "images", page: 1, timeFilter: "any" as const };
    const a = await runKey(id, { ...scope, image: "aaa" });
    const b = await runKey(id, { ...scope, image: "bbb" });
    expect(a).not.toBe(b);
    expect(await runKey(id, scope)).not.toBe(a);
  });
});

describe("parseSearchImage", () => {
  test("accepts a data URL or bare base64 of a real image", () => {
    const bare = parseSearchImage(PNG_1PX);
    expect(bare?.mime).toBe("image/png");
    expect(bare?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(parseSearchImage(`data:image/png;base64,${PNG_1PX}`)?.hash).toBe(bare!.hash);
  });

  test("refuses anything that isn't a jpeg, png or webp", () => {
    expect(parseSearchImage(Buffer.from("<svg></svg>").toString("base64"))).toBeUndefined();
    expect(parseSearchImage("not base64 at all!")).toBeUndefined();
    expect(parseSearchImage(Buffer.from([0, 0, 1, 0, 1, 2]).toString("base64"))).toBeUndefined();
    expect(parseSearchImage(42)).toBeUndefined();
  });

  test("refuses images over the size limit", () => {
    const huge = Buffer.concat([
      Buffer.from(PNG_1PX, "base64"),
      Buffer.alloc(5 * 1024 * 1024),
    ]).toString("base64");
    expect(parseSearchImage(huge)).toBeUndefined();
  });
});

describe("hasSearchInput", () => {
  const image = parseSearchImage(PNG_1PX)!;

  test("an image is enough on its own", () => {
    expect(hasSearchInput("", image)).toBe(true);
    expect(hasSearchInput("", undefined)).toBe(false);
  });

  test("a query that isn't a string is refused even with an image", () => {
    expect(hasSearchInput(5, image)).toBe(false);
    expect(hasSearchInput({ trim: 1 }, image)).toBe(false);
  });
});

describe("queryImage", () => {
  const image = parseSearchImage(PNG_1PX)!;
  const provider = (imageQuery: ImageQueryProvider["imageQuery"]): ImageQueryProvider =>
    ({ name: "describer", imageQuery }) as ImageQueryProvider;

  test("gives up on a provider that never answers", async () => {
    const started = Date.now();
    const outcome = await queryImage(provider(() => new Promise(() => {})), image, "", {
      timeoutMs: 50,
    });
    expect(outcome.query).toBeUndefined();
    expect(outcome.error).toBeTruthy();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test("returns nothing when the caller aborts", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 20);
    const outcome = await queryImage(provider(() => new Promise(() => {})), image, "", {
      signal: ac.signal,
    });
    expect(outcome).toEqual({});
  });

  test("passes the provider's answer through", async () => {
    const outcome = await queryImage(provider(async () => "  a red   bicycle "), image, "");
    expect(outcome).toEqual({ query: "a red bicycle" });
  });
});
