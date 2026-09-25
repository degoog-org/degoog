import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { ExtensionMeta } from "../../src/server/types/extension";

const SOURCES: [string, string, string][] = [
  ["../../src/server/extensions/engines/extension-meta", "getEngineExtensionMeta", "e1-engine"],
  ["../../src/server/extensions/commands/registry", "getPluginExtensionMeta", "p1-command"],
  ["../../src/server/extensions/slots/registry", "getSlotExtensionMeta", "s1-slot"],
  ["../../src/server/extensions/interceptors/registry", "getInterceptorMeta", "i1-middleware"],
  ["../../src/server/extensions/search-bar/registry", "getSearchBarActionExtensionMeta", "b1-search-bar"],
  ["../../src/server/extensions/search-result-tabs/registry", "getSearchResultTabExtensionMeta", "t1-tab"],
  ["../../src/server/extensions/themes/registry", "getThemeExtensionMeta", "th1-theme"],
  ["../../src/server/extensions/transports/registry", "getTransportExtensionMeta", "tr1-transport"],
  ["../../src/server/extensions/autocomplete/registry", "getAutocompleteExtensionMeta", "a1-autocomplete"],
  ["../../src/server/extensions/shortcuts/registry", "getShortcutExtensionMeta", "sc1-shortcut"],
];
const LIFECYCLE_MOD = "../../src/server/extensions/store/item-lifecycle";

const reals = new Map<string, Record<string, unknown>>();
for (const [mod] of SOURCES) reals.set(mod, { ...(await import(mod)) });
const lifecycleReal = { ...(await import(LIFECYCLE_MOD)) };
const savedNoPassword = process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;

const meta = (id: string): ExtensionMeta =>
  ({ id, displayName: id, settings: { secret: "s" } }) as unknown as ExtensionMeta;

let router: { request: (req: string) => Response | Promise<Response> };

beforeAll(async () => {
  process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
  for (const [mod, fn, id] of SOURCES) {
    mock.module(mod, () => ({ ...reals.get(mod), [fn]: async () => [meta(id)] }));
  }
  mock.module(LIFECYCLE_MOD, () => ({
    ...lifecycleReal,
    getInstalledItems: async () => [
      { type: "plugin", installedAs: "s1", minDegoogVersion: "999.0.0" },
      { type: "theme", installedAs: "th1", minDegoogVersion: "0.0.1" },
      { type: "engine", installedAs: "e1" },
    ],
  }));
  router = (await import("../../src/server/routes/extensions/extensions")).default;
});

afterAll(() => {
  for (const [mod] of SOURCES) mock.module(mod, () => reals.get(mod)!);
  mock.module(LIFECYCLE_MOD, () => lifecycleReal);
  if (savedNoPassword === undefined) delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
  else process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = savedNoPassword;
});

const ids = (items: ExtensionMeta[]): string[] => items.map((m) => m.id);

describe("GET /api/extensions", () => {
  test("groups every registry's metas, folding plugin kinds into plugins", async () => {
    const body = await (await router.request("http://localhost/api/extensions")).json();
    expect(Object.keys(body)).toEqual([
      "engines",
      "plugins",
      "themes",
      "transports",
      "autocomplete",
      "shortcuts",
    ]);
    expect(ids(body.engines)).toEqual(["e1-engine"]);
    expect(ids(body.plugins)).toEqual([
      "p1-command",
      "s1-slot",
      "i1-middleware",
      "b1-search-bar",
      "t1-tab",
    ]);
    expect(ids(body.themes)).toEqual(["th1-theme"]);
    expect(ids(body.transports)).toEqual(["tr1-transport"]);
    expect(ids(body.autocomplete)).toEqual(["a1-autocomplete"]);
    expect(ids(body.shortcuts)).toEqual(["sc1-shortcut"]);
    expect(body.engines[0].settings).toEqual({ secret: "s" });
  });

  test("installed items flag metas that need a newer degoog, across all groups", async () => {
    const body = await (await router.request("http://localhost/api/extensions")).json();
    const slot = body.plugins.find((m: ExtensionMeta) => m.id === "s1-slot");
    expect(slot.requiresNewerVersion).toBe(true);
    expect(body.themes[0].requiresNewerVersion).toBe(false);
    expect(body.engines[0]).not.toHaveProperty("requiresNewerVersion");
  });

  test("a type filter returns just that group", async () => {
    const body = await (await router.request("http://localhost/api/extensions?type=plugins")).json();
    expect(Object.keys(body)).toEqual(["plugins"]);
    expect(body.plugins).toHaveLength(5);
  });
});
