import { describe, test, expect, afterAll } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { writeJsonAtomic } from "../../src/server/utils/atomic-json";

describe("writeJsonAtomic", () => {
  let dir = "";

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test("writes pretty JSON and leaves no temp file behind", async () => {
    dir = await mkdtemp(join(tmpdir(), "degoog-atomic-"));
    const target = join(dir, "data.json");
    await writeJsonAtomic(target, { a: 1, b: ["x"] });

    const raw = await readFile(target, "utf-8");
    expect(JSON.parse(raw)).toEqual({ a: 1, b: ["x"] });
    expect(raw).toContain("\n  ");

    const files = await readdir(dir);
    expect(files).toEqual(["data.json"]);
  });

  test("overwrites an existing file", async () => {
    const target = join(dir, "data.json");
    await writeJsonAtomic(target, { v: 2 });
    expect(JSON.parse(await readFile(target, "utf-8"))).toEqual({ v: 2 });
  });

  test("concurrent writes to the same file do not collide or leak temps", async () => {
    const target = join(dir, "race.json");
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => writeJsonAtomic(target, { i })),
    );

    const parsed = JSON.parse(await readFile(target, "utf-8")) as { i: number };
    expect(typeof parsed.i).toBe("number");

    const leftover = (await readdir(dir)).filter((f) =>
      f.startsWith("race.json.tmp-"),
    );
    expect(leftover).toEqual([]);
  });
});
