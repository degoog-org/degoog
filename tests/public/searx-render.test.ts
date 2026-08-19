import { describe, test, expect, beforeAll } from "bun:test";
import type { SearxCatalogItem } from "../../src/client/types/searx-catalog";

let searxGroups: (items: SearxCatalogItem[]) => { key: string; items: SearxCatalogItem[] }[];
let searxPackages: (item: SearxCatalogItem) => string[];

const makeItem = (over: Partial<SearxCatalogItem> = {}): SearxCatalogItem => ({
  code: "mojeek",
  name: "Mojeek",
  types: ["web"],
  installed: false,
  missingDeps: [],
  libs: [],
  ...over,
});

beforeAll(async () => {
  const stub = { scopedT: (): ((key: string) => string) => (key: string) => key };
  Object.assign(globalThis, { window: stub });
  const render = await import("../../src/client/settings/engines/searx-render");
  searxGroups = render.searxGroups;
  searxPackages = render.searxPackages;
});

describe("searx catalogue rendering", () => {
  test("groups by primary type and keeps web first", () => {
    const groups = searxGroups([
      makeItem({ code: "artic", name: "Artic", types: ["images"] }),
      makeItem(),
      makeItem({ code: "ansa", name: "Ansa", types: ["news"] }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["web", "images", "news"]);
  });

  test("only the missing libs turn into an install hint", () => {
    const item = makeItem({
      libs: [
        { module: "babel", package: "Babel", missing: true },
        { module: "lxml", package: "lxml", missing: false },
      ],
    });
    expect(searxPackages(item)).toEqual(["Babel"]);
    expect(searxPackages(makeItem())).toEqual([]);
  });
});
