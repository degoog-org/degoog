import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { installClientEnv } from "../helpers/client-env";

type BaseWindow = { __DEGOOG_BASE_URL__?: string };
type UrlModule = typeof import("../../src/client/utils/net/url");
type StateModule = typeof import("../../src/client/state");

let restore: () => void;
let buildSearchUrl: UrlModule["buildSearchUrl"];
let state: StateModule["state"];

const withBase = (base: string, fn: () => void): void => {
  const g = globalThis as unknown as { window: BaseWindow };
  const prev = g.window.__DEGOOG_BASE_URL__;
  g.window.__DEGOOG_BASE_URL__ = base;
  try {
    fn();
  } finally {
    g.window.__DEGOOG_BASE_URL__ = prev;
  }
};

describe("public/url", () => {
  beforeAll(async () => {
    restore = installClientEnv();
    ({ buildSearchUrl } = await import("../../src/client/utils/net/url"));
    ({ state } = await import("../../src/client/state"));
  });

  afterAll(() => restore());

  test("buildSearchUrl includes query and engine params", () => {
    state.currentTimeFilter = "any";
    const out = buildSearchUrl("test query", { duckduckgo: true }, "all", 1);
    expect(out).toContain("/api/search");
    expect(out).toContain("q=test+query");
    expect(out).toContain("duckduckgo=true");
  });

  test("buildSearchUrl prefixes with the configured base url", () => {
    withBase("/degoog", () => {
      state.currentTimeFilter = "any";
      const out = buildSearchUrl("test query", { duckduckgo: true }, "all", 1);
      expect(out.startsWith("/degoog/api/search?")).toBe(true);
    });
  });
});
