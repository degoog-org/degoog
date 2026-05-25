import { describe, test, expect } from "bun:test";
import { settingsIdsForInstalled } from "../../src/server/extensions/store/item-ops";
import { ExtensionStoreType } from "../../src/server/types";

describe("settingsIdsForInstalled", () => {
  test("engine uses canonical -engine suffix, not engine- prefix", () => {
    const ids = settingsIdsForInstalled(ExtensionStoreType.Engine, "acme-foo");
    expect(ids).toContain("acme-foo-engine");
    expect(ids).not.toContain("engine-acme-foo");
  });

  test("transport uses transport-<canonical> form", () => {
    const ids = settingsIdsForInstalled(
      ExtensionStoreType.Transport,
      "acme-bar",
    );
    expect(ids).toContain("transport-acme-bar-transport");
  });

  test("theme uses theme-<canonical> form", () => {
    const ids = settingsIdsForInstalled(ExtensionStoreType.Theme, "acme-zen");
    expect(ids).toContain("theme-acme-zen-theme");
  });

  test("autocomplete uses autocomplete- prefix", () => {
    const ids = settingsIdsForInstalled(
      ExtensionStoreType.Autocomplete,
      "acme-ac",
    );
    expect(ids).toContain("autocomplete-acme-ac");
  });

  test("plugin always includes plugin-<folder>", () => {
    const ids = settingsIdsForInstalled(ExtensionStoreType.Plugin, "acme-px");
    expect(ids).toContain("plugin-acme-px");
  });
});
