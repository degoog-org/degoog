import { describe, expect, test } from "bun:test";
import { getExtFilter } from "../../../src/client/settings/shared/filter/ext-filter";
import type { ExtensionMeta } from "../../../src/client/types/extension";
import type { ExtFilterGroup } from "../../../src/client/types/ext-filter";

const _ext = (id: string, displayName: string): ExtensionMeta => ({
  id,
  displayName,
  description: "",
  type: "engine",
  configurable: false,
  settingsSchema: [],
  settings: {},
});

const GROUPS: ExtFilterGroup[] = [
  { key: "web", label: "Web", items: [_ext("bing-engine", "Bing"), _ext("brave-engine", "Brave")] },
  { key: "images", label: "Images", items: [_ext("pixabay-engine", "Pixabay")] },
];

describe("getExtFilter", () => {
  test("returns the same filter for the same key, so the query survives a re-init", () => {
    const first = getExtFilter("same-key", GROUPS);
    first.q = "brave";

    const second = getExtFilter("same-key", GROUPS);

    expect(second).toBe(first);
    expect(second.q).toBe("brave");
  });

  test("keeps the selected type while its group still exists", () => {
    getExtFilter("retain-type", GROUPS).type = "images";

    expect(getExtFilter("retain-type", GROUPS).type).toBe("images");
  });

  test("falls back to all types once the selected group is gone", () => {
    getExtFilter("drop-type", GROUPS).type = "images";

    expect(getExtFilter("drop-type", [GROUPS[0]]).type).toBe("all");
  });
});
