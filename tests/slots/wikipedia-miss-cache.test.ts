import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { PluginContext, SlotPlugin } from "../../src/server/types/extension";

const OUTGOING_MOD = "../../src/server/utils/net/outgoing";
const outgoingReal = { ...(await import(OUTGOING_MOD)) };
const { useCache, createCache } = await import("../../src/server/utils/cache/cache");

const FAILING_TITLE = "wikipedia is down";

const requested: string[] = [];
let wiki: SlotPlugin;

const _requestsFor = (title: string): number =>
  requested.filter((t) => t === title).length;

beforeAll(async () => {
  mock.module(OUTGOING_MOD, () => ({
    ...outgoingReal,
    outgoingFetch: async (url: string) => {
      const title = new URL(url).searchParams.get("titles")?.toLowerCase() ?? "";
      requested.push(title);
      if (title === FAILING_TITLE) return new Response("", { status: 503 });
      return Response.json({ query: { pages: { "-1": { missing: "" } } } });
    },
  }));
  wiki = (await import("../../src/server/extensions/commands/builtins/wikipedia")).slot;
  wiki.init?.({
    template: "<h3>{{title}}</h3>",
    useCache,
    createCache,
    signProxyUrl: (u: string) => u,
  } as unknown as PluginContext);
});

afterAll(() => {
  mock.module(OUTGOING_MOD, () => outgoingReal);
});

describe("wikipedia knowledge panel without an article", () => {
  test("asks Wikipedia once for a query that has no article", async () => {
    const query = "banana bread recipe";
    expect(await wiki.trigger(query)).toBe(false);
    expect(await wiki.trigger(query)).toBe(false);
    expect((await wiki.execute(query)).html).toBe("");
    expect(_requestsFor(query)).toBe(1);
  });

  test("asks again after a failed request instead of remembering it", async () => {
    expect(await wiki.trigger(FAILING_TITLE)).toBe(false);
    expect(await wiki.trigger(FAILING_TITLE)).toBe(false);
    expect(_requestsFor(FAILING_TITLE)).toBe(2);
  });
});
