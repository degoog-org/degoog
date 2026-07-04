import { describe, test, expect } from "bun:test";
import {
  buildSettingsNav,
  buildSettingsTabSelect,
} from "../../src/server/routes/pages/settings-nav";
import { SETTINGS_NAV } from "../../src/shared/settings-tabs";

const tabOrder = (html: string, pattern: RegExp): string[] =>
  [...html.matchAll(pattern)].map((m) => m[1]);

describe("settings nav generation", () => {
  test("nav buttons follow SETTINGS_NAV order", () => {
    const order = tabOrder(buildSettingsNav(), /data-tab="([^"]+)"/g);
    expect(order).toEqual(SETTINGS_NAV.map((item) => item.id));
  });

  test("mobile select omits dynamic tabs but keeps the rest in order", () => {
    const order = tabOrder(buildSettingsTabSelect(), /value="([^"]+)"/g);
    const expected = SETTINGS_NAV.filter(
      (item) => !item.hiddenUntilEnabled,
    ).map((item) => item.id);
    expect(order).toEqual(expected);
    expect(order).not.toContain("indexer");
  });

  test("nav and select stay in sync aside from dynamic tabs", () => {
    const navOrder = tabOrder(buildSettingsNav(), /data-tab="([^"]+)"/g).filter(
      (id) => id !== "indexer",
    );
    const selectOrder = tabOrder(buildSettingsTabSelect(), /value="([^"]+)"/g);
    expect(selectOrder).toEqual(navOrder);
  });

  test("indexer stays hidden until enabled", () => {
    const html = buildSettingsNav();
    expect(html).toContain('data-tab="indexer"');
    expect(html).toMatch(/data-indexer-nav style="display: none"/);
  });

  test("general is the active tab on load", () => {
    expect(buildSettingsNav()).toMatch(
      /class="settings-nav-item active" data-tab="general"/,
    );
  });
});
