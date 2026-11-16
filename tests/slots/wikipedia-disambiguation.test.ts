import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { PluginContext, SlotPlugin } from "../../src/server/types/extension";

const OUTGOING_MOD = "../../src/server/utils/net/outgoing";
const outgoingReal = { ...(await import(OUTGOING_MOD)) };
const { useCache, createCache } = await import("../../src/server/utils/cache/cache");

const PAGES: Record<string, Record<string, unknown>> = {
  floating: {
    pageid: 245985,
    title: "Floating",
    description: "Topics referred to by the same term",
    extract: "Floating may refer to:",
    fullurl: "https://en.wikipedia.org/wiki/Floating",
    pageprops: {
      disambiguation: "",
      "wikibase-shortdesc": "Topics referred to by the same term",
      wikibase_item: "Q17128870",
    },
  },
  mercure: {
    pageid: 2016,
    title: "Mercure",
    description: "page d'homonymie de Wikimédia",
    extract:
      "Le nom propre Mercure (du latin Mercurius, le dieu ou la planète) et, par antonomase, le nom commun mercure, prennent différentes significations selon le contexte.",
    fullurl: "https://fr.wikipedia.org/wiki/Mercure",
    pageprops: { disambiguation: "", wikibase_item: "Q1921483" },
  },
  "eiffel tower": {
    pageid: 9232,
    title: "Eiffel Tower",
    description: "Tower in Paris, France",
    extract: "The Eiffel Tower is a lattice tower on the Champ de Mars in Paris, France.",
    fullurl: "https://en.wikipedia.org/wiki/Eiffel_Tower",
    thumbnail: { source: "https://upload.wikimedia.org/eiffel.jpg" },
    pageprops: { wikibase_item: "Q243" },
  },
};

let wiki: SlotPlugin;

beforeAll(async () => {
  mock.module(OUTGOING_MOD, () => ({
    ...outgoingReal,
    outgoingFetch: async (url: string) => {
      const title = new URL(url).searchParams.get("titles")?.toLowerCase() ?? "";
      return Response.json({ query: { pages: { "1": PAGES[title] ?? { missing: "" } } } });
    },
  }));
  wiki = (await import("../../src/server/extensions/commands/builtins/wikipedia")).slot;
  wiki.init?.({
    template: "<h3>{{title}}</h3><p>{{extract}}</p>",
    useCache,
    createCache,
    signProxyUrl: (u: string) => u,
  } as unknown as PluginContext);
});

afterAll(() => {
  mock.module(OUTGOING_MOD, () => outgoingReal);
});

describe("wikipedia knowledge panel disambiguation pages", () => {
  test.each(["floating", "mercure"])(
    "renders no panel for the %s disambiguation page",
    async (query) => {
      expect(await wiki.trigger(query)).toBe(false);
      expect((await wiki.execute(query)).html).toBe("");
    },
  );

  test("still renders a regular article", async () => {
    expect(await wiki.trigger("eiffel tower")).toBe(true);
    const out = await wiki.execute("eiffel tower");
    expect(out.title).toBe("Eiffel Tower");
    expect(out.html).toContain("lattice tower");
  });
});
