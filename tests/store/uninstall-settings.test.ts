import { describe, test, expect } from "bun:test";
import { settingsIdsForInstalled } from "../../src/server/extensions/store/item-ops";
import { ExtensionStoreType } from "../../src/server/types";

const CASES: [ExtensionStoreType, string, string, string][] = [
  [ExtensionStoreType.Engine, "acme-foo", "acme-foo-engine", "engine-acme-foo"],
  [
    ExtensionStoreType.Transport,
    "acme-bar",
    "acme-bar-transport",
    "transport-acme-bar",
  ],
  [ExtensionStoreType.Theme, "acme-zen", "acme-zen-theme", "theme-acme-zen"],
  [
    ExtensionStoreType.Autocomplete,
    "acme-ac",
    "acme-ac-autocomplete",
    "autocomplete-acme-ac",
  ],
  [
    ExtensionStoreType.Shortcut,
    "acme-do-thing",
    "acme-do-thing-shortcut",
    "shortcut-acme-do-thing",
  ],
  [ExtensionStoreType.Plugin, "acme-px", "acme-px-command", "plugin-acme-px"],
];

describe("settingsIdsForInstalled", () => {
  for (const [type, installedAs, canonical, legacy] of CASES) {
    test(`${type} uses the canonical ${canonical} id, not ${legacy}`, () => {
      const ids = settingsIdsForInstalled(type, installedAs);
      expect(ids).toContain(canonical);
      expect(ids).not.toContain(legacy);
    });
  }
});
