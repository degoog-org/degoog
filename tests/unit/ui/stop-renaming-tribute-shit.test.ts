import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";

type Block = {
  files?: string[];
  ignores?: string[];
  rules?: Record<string, unknown>;
};

const CONFIG_PATH = "../../../eslint.config.js";

const loadBlocks = async (): Promise<Block[]> => {
  const loaded: unknown = await import(CONFIG_PATH);
  return (loaded as { default: Block[] }).default;
};

const blocks = await loadBlocks();

const blockWith = (rule: string): Block => {
  const found = blocks.find((block) => block.rules?.[rule] !== undefined);
  if (!found) throw new Error(`no eslint block defines ${rule}`);
  return found;
};

const literalPaths = (patterns: string[] | undefined): string[] =>
  (patterns ?? []).filter((pattern) => !pattern.includes("*"));

const importGuardRegex = (): RegExp => {
  const rule = blockWith("no-restricted-imports")
    .rules?.["no-restricted-imports"] as [string, { patterns: { regex: string }[] }];
  return new RegExp(rule[1].patterns[0].regex);
};

const RUNTIME_DIR = "src/shared/ui/tribute";

describe("stopRenamingTributeShit", () => {
  test("every file eslint names by hand still exists", () => {
    const named = blocks.flatMap((block) => [
      ...literalPaths(block.files),
      ...literalPaths(block.ignores),
    ]);
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((path) => !existsSync(path))).toEqual([]);
  });

  test("the browser-only renderer is blocked for server code", () => {
    const blocked = importGuardRegex();
    for (const specifier of [
      "../../shared/ui",
      "../../shared/ui/index",
      "../../shared/ui/components",
      "../../shared/ui/components/index",
      `../../${RUNTIME_DIR.replace("src/", "")}/dom`,
      "../../shared/ui/components/overlay/shell",
    ]) {
      expect([specifier, blocked.test(specifier)]).toEqual([specifier, true]);
    }
  });

  test("the rest of the runtime stays importable by the server", () => {
    const blocked = importGuardRegex();
    const allowed = readdirSync(RUNTIME_DIR)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => name.replace(/\.ts$/, ""))
      .filter((name) => name !== "dom");
    expect(allowed.length).toBeGreaterThan(2);
    for (const name of allowed) {
      const specifier = `../../shared/ui/tribute/${name}`;
      expect([specifier, blocked.test(specifier)]).toEqual([specifier, false]);
    }
  });

  test("the innerHTML ban still points at the renderer that owns render and clear", () => {
    const rule = blockWith("no-restricted-syntax").rules?.[
      "no-restricted-syntax"
    ] as [string, ...{ message: string }[]];
    const entries = rule.slice(1) as { message: string }[];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.message).toContain(RUNTIME_DIR.replace("src/", ""));
    }
  });
});
