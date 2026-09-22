import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const COMPONENT = /^export\s+(?:const|function)\s+([A-Z][A-Za-z0-9]*)\s*[=(<]/gm;

const tsxFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "public" || name === "node_modules") continue;
      out.push(...tsxFiles(path));
    } else if (name.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
};

const componentsIn = (path: string): string[] => {
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(COMPONENT)].map((m) => m[1]);
};

describe("one component per file", () => {
  const files = tsxFiles("src");

  test("src has .tsx files to check", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  test("no .tsx file exports more than one component", () => {
    const offenders = files
      .map((path) => ({ path, names: componentsIn(path) }))
      .filter((f) => f.names.length > 1)
      .map((f) => `${f.path}: ${f.names.join(", ")}`);
    expect(offenders).toEqual([]);
  });
});
