import { describe, test, expect, beforeAll } from "bun:test";
import type { CompatCatalogItem } from "../../src/shared/compat-layers";

let compatGroups: (items: CompatCatalogItem[]) => { key: string; items: CompatCatalogItem[] }[];
let compatPackages: (item: CompatCatalogItem) => string[];
let compatListHtml: (items: CompatCatalogItem[], layer: string) => string;
let compatShellHtml: (layer: string) => string;

const makeItem = (over: Partial<CompatCatalogItem> = {}): CompatCatalogItem => ({
  code: "mojeek",
  name: "Mojeek",
  types: ["web"],
  installed: false,
  missingDeps: [],
  runtime: [],
  ...over,
});

beforeAll(async () => {
  const stubT =
    (): ((key: string, vars?: Record<string, string>) => string) =>
    (key: string, vars?: Record<string, string>) =>
      vars?.layer ? `${key}|${vars.layer}` : key;
  const createEl = (): { textContent: string; innerHTML: string } => {
    let text = "";
    return {
      set textContent(value: string) {
        text = String(value);
      },
      get textContent() {
        return text;
      },
      get innerHTML() {
        return text;
      },
    };
  };
  Object.assign(globalThis, {
    window: { scopedT: stubT },
    document: { createElement: createEl },
  });
  const render = await import("../../src/client/settings/engines/compat-render");
  compatGroups = render.compatGroups;
  compatPackages = render.compatPackages;
  compatListHtml = render.compatListHtml;
  compatShellHtml = render.compatShellHtml;
});

describe("compatibility layer catalogue rendering", () => {
  test("groups by primary type and keeps web first", () => {
    const groups = compatGroups([
      makeItem({ code: "artic", name: "Artic", types: ["images"] }),
      makeItem(),
      makeItem({ code: "ansa", name: "Ansa", types: ["news"] }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["web", "images", "news"]);
  });

  test("only the missing runtime bits turn into an install hint", () => {
    const item = makeItem({
      runtime: [
        { module: "babel", package: "Babel", missing: true },
        { module: "lxml", package: "lxml", missing: false },
      ],
    });
    expect(compatPackages(item)).toEqual(["Babel"]);
    expect(compatPackages(makeItem())).toEqual([]);
  });

  test("search placeholder and empty state carry the layer name", () => {
    expect(compatShellHtml("4get")).toContain(
      "settings-page.extensions.compat-search|4get",
    );
    expect(compatListHtml([], "SearX")).toContain(
      "settings-page.extensions.compat-empty|SearX",
    );
  });

  test("shared files hint and update tooltip name the layer", () => {
    const shared = compatListHtml([makeItem({ deps: ["backend"] })], "4get");
    expect(shared).toContain("settings-page.extensions.compat-shared-hint|4get");
    const update = compatListHtml([makeItem({ installed: true })], "SearX");
    expect(update).toContain("settings-page.extensions.compat-update|SearX");
  });

  test("quotes in catalogue values cannot escape an attribute", () => {
    const html = compatListHtml(
      [makeItem({ code: '" onerror="boom', name: "Ansa", site: undefined })],
      "4get",
    );
    expect(html).not.toContain('onerror="boom');
    expect(html).toContain("&quot; onerror=&quot;boom");
  });
});

describe("the compatibility layer modal body", () => {
  test("only the newest layer handles a click on the shared modal body", async () => {
    const { bindCompatClicks } = await import(
      "../../src/client/settings/engines/compat-clicks"
    );
    const handlers: ((event: MouseEvent) => void)[] = [];
    const body = {
      addEventListener: (_type: "click", handler: (event: MouseEvent) => void) => {
        handlers.push(handler);
      },
      removeEventListener: (_type: "click", handler: (event: MouseEvent) => void) => {
        const at = handlers.indexOf(handler);
        if (at !== -1) handlers.splice(at, 1);
      },
    };
    const seen: string[] = [];
    bindCompatClicks(body, () => seen.push("searx"));
    bindCompatClicks(body, () => seen.push("4get"));
    expect(handlers.length).toBe(1);
    for (const handler of handlers) handler({} as MouseEvent);
    expect(seen).toEqual(["4get"]);
  });
});
