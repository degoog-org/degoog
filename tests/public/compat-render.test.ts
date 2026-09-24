import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import {
  CompatLayerId,
  COMPAT_LAYER_REPOS,
  type CompatCatalogItem,
} from "../../src/shared/compat-layers";

let compatGroups: (
  items: CompatCatalogItem[],
) => { key: string; items: CompatCatalogItem[] }[];
let compatPackages: (item: CompatCatalogItem) => string[];
let compatListHtml: (items: CompatCatalogItem[], layer: string) => string;
let compatShellHtml: (id: CompatLayerId) => string;

let priorGlobals: Record<string, PropertyDescriptor | undefined> = {};

const makeItem = (
  over: Partial<CompatCatalogItem> = {},
): CompatCatalogItem => ({
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
    (key: string, vars?: Record<string, string>) => {
      if (key.endsWith("compat-intro-searx")) return "{link} is SearXNG";
      if (key.endsWith("compat-intro-4get")) return "{link} is 4get";
      return vars?.layer ? `${key}|${vars.layer}` : key;
    };
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
  priorGlobals = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
  };
  Object.assign(globalThis, {
    window: { scopedT: stubT },
    document: { createElement: createEl },
  });
  const grouping = await import("../../src/client/settings/engines/compat/render/grouping");
  const { CompatList } = await import("../../src/client/settings/engines/compat/render/list");
  const { CompatShell } = await import("../../src/client/settings/engines/compat/render/shell");
  compatGroups = grouping.compatGroups;
  compatPackages = grouping.compatPackages;
  const { renderHtml } = await import("../../src/shared/ui/tribute/html");
  compatListHtml = (items, layer) => renderHtml(CompatList({ items, layer }));
  compatShellHtml = (id) => renderHtml(CompatShell({ id }));
});

afterAll(() => {
  for (const [key, descriptor] of Object.entries(priorGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
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

  test("placeholder, empty state, shared hint and update tooltip carry the layer name", () => {
    expect(compatShellHtml(CompatLayerId.FourGet)).toContain(
      "settings-page.extensions.compat-search|4get",
    );
    expect(compatListHtml([], "SearX")).toContain(
      "settings-page.extensions.compat-empty|SearX",
    );
    expect(compatListHtml([makeItem({ deps: ["backend"] })], "4get")).toContain(
      "settings-page.extensions.compat-shared-hint|4get",
    );
    expect(compatListHtml([makeItem({ installed: true })], "SearX")).toContain(
      "settings-page.extensions.compat-update|SearX",
    );
  });

  test("modal shell explains the layer and links to its repo", () => {
    const searx = compatShellHtml(CompatLayerId.Searx);
    expect(searx).toContain("compat-note-intro");
    expect(searx).toContain(
      `href="${COMPAT_LAYER_REPOS[CompatLayerId.Searx]}"`,
    );
    expect(searx).toContain("is SearXNG");
    expect(searx).not.toContain("{link}");
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
    const { bindCompatClicks } =
      await import("../../src/client/settings/engines/compat/compat-clicks");
    const handlers: ((event: MouseEvent) => void)[] = [];
    const body = {
      addEventListener: (
        _type: "click",
        handler: (event: MouseEvent) => void,
      ) => {
        handlers.push(handler);
      },
      removeEventListener: (
        _type: "click",
        handler: (event: MouseEvent) => void,
      ) => {
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
