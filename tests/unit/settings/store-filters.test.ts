import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import type { StoreItem, StoreState } from "../../../src/client/types/store-tab";
import { installClientEnv } from "../../helpers/client-env";

type Passes = typeof import("../../../src/client/settings/store/model").passes;

let passes: Passes;
let restoreClientEnv: () => void;

const _item = (overrides: Partial<StoreItem>): StoreItem => ({
  path: "x",
  repoSlug: "repo",
  repoUrl: "https://example.test/repo.git",
  repoName: "official-extensions",
  name: "Calm Green",
  description: "Soft green theme",
  version: "1.0.0",
  type: "theme",
  installed: false,
  screenshots: [],
  author: { name: "fccview" },
  ...overrides,
});

const ITEMS = [
  _item({ path: "green", name: "Calm Green" }),
  _item({ path: "zen", name: "Zen", description: "Paper-colored theme" }),
  _item({ path: "weather", name: "Weather", type: "plugin", description: "Open-Meteo forecasts" }),
];

const _search = (q: string): string[] => {
  const state = { q, kind: "all", sub: "", status: "all", repoSel: [] } as unknown as StoreState;
  return ITEMS.filter((item) => passes(state, item, "")).map((item) => item.path);
};

beforeAll(async () => {
  restoreClientEnv = installClientEnv();
  ({ passes } = await import("../../../src/client/settings/store/model"));
});

afterAll(() => restoreClientEnv());

describe("store passes search", () => {
  test("blank query keeps every item", () => {
    expect(_search("   ")).toEqual(["green", "zen", "weather"]);
  });

  test("every word must match somewhere in the item", () => {
    expect(_search("green theme")).toEqual(["green"]);
    expect(_search("theme")).toEqual(["green", "zen"]);
  });

  test("matching ignores case and extra whitespace", () => {
    expect(_search("  OPEN   meteo ")).toEqual(["weather"]);
  });

  test("matches author and repo names", () => {
    expect(_search("fccview official")).toEqual(["green", "zen", "weather"]);
  });

  test("no match returns nothing", () => {
    expect(_search("green weather")).toEqual([]);
  });
});
