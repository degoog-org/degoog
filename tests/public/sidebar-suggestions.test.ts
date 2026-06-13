import { describe, expect, test } from "bun:test";

import { normalizeSidebarSuggestions } from "../../src/client/utils/search/sidebar-suggestions-normalize";

describe("sidebar suggestions", () => {
  test("normalizes autocomplete provider results for People also search for", () => {
    const suggestions = normalizeSidebarSuggestions(
      [
        { text: "degoog github", source: "Google Autocomplete" },
        { text: "Degoog", source: "Google Autocomplete" },
        { text: "degoog github", source: "Other Autocomplete" },
        { text: "  degoog docs  ", source: "Other Autocomplete" },
        { text: "", source: "Broken" },
        { nope: "bad shape" },
      ],
      "degoog",
      8,
    );

    expect(suggestions).toEqual(["degoog github", "degoog docs"]);
  });

  test("caps sidebar suggestions", () => {
    const suggestions = normalizeSidebarSuggestions(
      Array.from({ length: 12 }, (_, i) => ({ text: `query ${i}` })),
      "query",
      8,
    );

    expect(suggestions).toHaveLength(8);
    expect(suggestions.at(-1)).toBe("query 7");
  });
});
