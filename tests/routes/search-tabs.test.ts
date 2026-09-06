import { afterEach, describe, expect, mock, test } from "bun:test";

const ENGINES_MOD = "../../src/server/extensions/engines/registry";
const SETTINGS_MOD = "../../src/server/utils/plugin-settings";
const TABS_MOD = "../../src/server/extensions/search-result-tabs/registry";

const enginesReal = { ...(await import(ENGINES_MOD)) };
const settingsReal = { ...(await import(SETTINGS_MOD)) };
const tabsReal = { ...(await import(TABS_MOD)) };

afterEach(() => {
  mock.module(ENGINES_MOD, () => enginesReal);
  mock.module(SETTINGS_MOD, () => settingsReal);
  mock.module(TABS_MOD, () => tabsReal);
});

describe("GET /api/search-tabs", () => {
  test("result tabs override discovered engine tabs case-insensitively", async () => {
    mock.module(ENGINES_MOD, () => ({
      ...enginesReal,
      getCustomEngineTypes: async () => ["Foo"],
    }));
    mock.module(SETTINGS_MOD, () => ({
      ...settingsReal,
      isDisabled: async () => false,
    }));
    mock.module(TABS_MOD, () => ({
      ...tabsReal,
      getSearchResultTabs: () => [
        {
          id: "foo-tab",
          name: "Foo Results",
          icon: "foo.svg",
          engineType: "foo",
        },
      ],
    }));

    const router = (await import("../../src/server/routes/search")).default;
    const res = await router.request("http://localhost/api/search-tabs");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tabs: [{ id: "foo-tab", name: "Foo Results", icon: "foo.svg" }],
    });
  });
});
