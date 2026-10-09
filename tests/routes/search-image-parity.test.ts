import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { ScoredResult } from "../../src/shared/search-types";

const { initServerKey } = await import("../../src/server/utils/security/server-key");
await initServerKey();
const { initEngines } = await import("../../src/server/extensions/engines/loader");
const { listEngines } = await import("../../src/server/extensions/engines/catalog");
const { initPlugins } = await import("../../src/server/extensions/commands/registry");

type Describer = { mode: "ok" | "fail" | "off"; calls: { text: string; mime: string }[] };
const describer = (): Describer => (globalThis as unknown as { __describer: Describer }).__describer;
(globalThis as unknown as { __describer: Describer }).__describer = { mode: "ok", calls: [] };

const DESCRIBER = `export default {
  name: "Looker",
  description: "test describer",
  trigger: "looker",
  async execute() { return { title: "", html: "" }; },
  describesImages() { return globalThis.__describer.mode !== "off"; },
  async imageQuery(image, ctx) {
    globalThis.__describer.calls.push({ text: ctx.text, mime: image.mime });
    if (globalThis.__describer.mode === "fail") throw new Error("model is down");
    return "crimson bicycle" + (ctx.text ? " " + ctx.text : "");
  },
};
`;

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const ENGINE = (name: string, input: string, prefix: string): string => `export const type = "images";
export const input = "${input}";
export default class {
  name = "${name}";
  async executeSearch(query, page, _time, ctx) {
    return [1, 2, 3].map((n) => ({
      title: "${prefix} " + n + " " + query + " " + (ctx.image ? ctx.image.hash.slice(0, 8) : "none"),
      url: "https://${prefix}.test/" + page + "/" + n,
      snippet: "",
      source: "${name}",
      thumbnail: "https://${prefix}.test/" + n + ".jpg",
    }));
  }
}
`;

type SseEvent = { event: string; data: Record<string, unknown> };

const readEvents = async (res: Response): Promise<SseEvent[]> =>
  (await res.text())
    .split("\n\n")
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => ({
      event: /^event: (.+)$/m.exec(chunk)?.[1] ?? "",
      data: JSON.parse(/^data: (.+)$/m.exec(chunk)?.[1] ?? "{}") as Record<string, unknown>,
    }));

const post = (path: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("image search parity between the stream and JSON paths", () => {
  let dir: string;
  let pluginDir: string;
  let prevEnv: string | undefined;
  let prevPlugins: string | undefined;
  let engines: string[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "degoog-image-parity-"));
    for (const [folder, body] of [
      ["lookalike", ENGINE("Lookalike", "image", "look")],
      ["wordy", ENGINE("Wordy", "text", "word")],
    ]) {
      await mkdir(join(dir, folder), { recursive: true });
      await writeFile(join(dir, folder, "index.ts"), body);
    }
    pluginDir = await mkdtemp(join(tmpdir(), "degoog-image-describer-"));
    await mkdir(join(pluginDir, "looker"), { recursive: true });
    await writeFile(join(pluginDir, "looker", "index.js"), DESCRIBER);
    prevEnv = process.env.DEGOOG_ENGINES_DIR;
    prevPlugins = process.env.DEGOOG_PLUGINS_DIR;
    process.env.DEGOOG_ENGINES_DIR = dir;
    process.env.DEGOOG_PLUGINS_DIR = pluginDir;
    await initEngines(true);
    await initPlugins();
    engines = (await listEngines())
      .filter((e) => ["Lookalike", "Wordy"].includes(e.displayName))
      .map((e) => e.id);
  });

  afterAll(async () => {
    if (prevEnv !== undefined) process.env.DEGOOG_ENGINES_DIR = prevEnv;
    else delete process.env.DEGOOG_ENGINES_DIR;
    if (prevPlugins !== undefined) process.env.DEGOOG_PLUGINS_DIR = prevPlugins;
    else delete process.env.DEGOOG_PLUGINS_DIR;
    await rm(dir, { recursive: true, force: true });
    await rm(pluginDir, { recursive: true, force: true });
  });

  const body = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    query: "red",
    engines,
    type: "images",
    image: PNG_1PX,
    ...extra,
  });

  const viaStream = async (b: Record<string, unknown>) => {
    const router = (await import("../../src/server/routes/search/stream")).default;
    const events = await readEvents(await router.request(post("/api/search/stream", b)));
    const done = events.find((e) => e.event === "done")!.data;
    const last = events.filter((e) => e.event === "engine-result").at(-1)!.data;
    return {
      engines: (done.engineTimings as { name: string }[]).map((t) => t.name).sort(),
      results: last.results as ScoredResult[],
      totalPages: done.totalPages,
      imageQuery: done.imageQuery as string | undefined,
      imageQueryError: done.imageQueryError as string | undefined,
      queryEvent: events.find((e) => e.event === "image-query")?.data,
    };
  };

  const viaJson = async (b: Record<string, unknown>) => {
    const router = (await import("../../src/server/routes/search/index")).default;
    const res = (await (await router.request(post("/api/search", b))).json()) as {
      engineTimings: { name: string }[];
      results: ScoredResult[];
      totalPages?: number;
      imageQuery?: string;
      imageQueryError?: string;
    };
    return {
      engines: res.engineTimings.map((t) => t.name).sort(),
      results: res.results,
      totalPages: res.totalPages,
      imageQuery: res.imageQuery,
      imageQueryError: res.imageQueryError,
    };
  };

  const shape = (results: ScoredResult[]) =>
    results.map((r) => ({ title: r.title, url: r.url, thumbnail: r.thumbnail }));

  test("with the describer off, both paths run only the image engine and agree on order and thumbnails", async () => {
    describer().mode = "off";
    const [stream, json] = await Promise.all([viaStream(body()), viaJson(body())]);
    expect(stream.engines).toEqual(["Lookalike"]);
    expect(stream.queryEvent).toBeUndefined();
    expect(json.engines).toEqual(stream.engines);
    expect(shape(json.results)).toEqual(shape(stream.results));
    expect(json.totalPages).toEqual(stream.totalPages as number | undefined);
  });

  test("with the describer off, a query sent by the client is ignored", async () => {
    describer().mode = "off";
    const json = await viaJson(body({ imageQuery: "crimson bicycle" }));
    expect(json.engines).toEqual(["Lookalike"]);
  });

  test("the describer turns the image into a query, once, and text engines run it on both paths", async () => {
    describer().mode = "ok";
    describer().calls = [];
    const [stream, json] = await Promise.all([viaStream(body()), viaJson(body())]);
    expect(describer().calls).toEqual([
      { text: "red", mime: "image/png" },
      { text: "red", mime: "image/png" },
    ]);
    expect(stream.queryEvent).toEqual({ query: "crimson bicycle red", error: null });
    expect(stream.imageQuery).toBe("crimson bicycle red");
    expect(json.imageQuery).toBe("crimson bicycle red");
    expect(stream.engines).toEqual(["Lookalike", "Wordy"]);
    expect(json.engines).toEqual(stream.engines);
    expect(shape(json.results)).toEqual(shape(stream.results));
  });

  test("a failing describer still returns the image engine and says why", async () => {
    describer().mode = "fail";
    const [stream, json] = await Promise.all([viaStream(body()), viaJson(body())]);
    expect(stream.queryEvent).toEqual({ query: null, error: "model is down" });
    expect(stream.imageQueryError).toBe("model is down");
    expect(json.imageQueryError).toBe("model is down");
    expect(stream.engines).toEqual(["Lookalike"]);
    expect(json.engines).toEqual(["Lookalike"]);
  });

  test("with a generated query from the client, text engines join without asking the describer again", async () => {
    describer().mode = "ok";
    describer().calls = [];
    const b = body({ imageQuery: "crimson bicycle" });
    const [stream, json] = await Promise.all([viaStream(b), viaJson(b)]);
    expect(stream.engines).toEqual(["Lookalike", "Wordy"]);
    expect(json.engines).toEqual(stream.engines);
    expect(shape(json.results)).toEqual(shape(stream.results));
    expect(json.totalPages).toEqual(stream.totalPages as number | undefined);
    const wordy = stream.results.find((r) => r.url.startsWith("https://word.test"));
    expect(wordy?.title).toBe("word 1 crimson bicycle none");
    expect(describer().calls).toEqual([]);
  });

  test("an image with no words is a valid search, a broken image is refused", async () => {
    const router = (await import("../../src/server/routes/search/index")).default;
    const ok = await router.request(post("/api/search", body({ query: "" })));
    expect(ok.status).toBe(200);
    const broken = await router.request(post("/api/search", body({ image: "data:image/png;base64,AAAA" })));
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as { code: string }).code).toBe("invalidImage");
    const stream = (await import("../../src/server/routes/search/stream")).default;
    const brokenStream = await stream.request(post("/api/search/stream", body({ image: "nope" })));
    expect(brokenStream.status).toBe(400);
    const empty = await stream.request(post("/api/search/stream", { query: "", engines }));
    expect(empty.status).toBe(400);
  });

  test("a text search over the same engines never runs the image engine", async () => {
    const router = (await import("../../src/server/routes/search/index")).default;
    const res = (await (
      await router.request(post("/api/search", { query: "red", engines, type: "images" }))
    ).json()) as { engineTimings: { name: string }[] };
    expect(res.engineTimings.map((t) => t.name)).toEqual(["Wordy"]);
  });

  test("a retry of the image engine keeps the image", async () => {
    describer().mode = "off";
    const router = (await import("../../src/server/routes/search/index")).default;
    const res = (await (
      await router.request(post("/api/search/retry", { ...body(), engine: "Lookalike" }))
    ).json()) as { results: ScoredResult[] };
    expect(res.results[0]?.title).toMatch(/^look 1 red [0-9a-f]{8}$/);
  });
});
