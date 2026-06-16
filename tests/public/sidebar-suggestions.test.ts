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

  test("returns empty array for non-array input", () => {
    expect(normalizeSidebarSuggestions(null, "query")).toEqual([]);
    expect(normalizeSidebarSuggestions(undefined, "query")).toEqual([]);
    expect(normalizeSidebarSuggestions("string", "query")).toEqual([]);
    expect(normalizeSidebarSuggestions(42, "query")).toEqual([]);
    expect(normalizeSidebarSuggestions({}, "query")).toEqual([]);
  });

  test("returns empty array for empty input array", () => {
    expect(normalizeSidebarSuggestions([], "query")).toEqual([]);
  });

  test("handles plain string items in the array", () => {
    const suggestions = normalizeSidebarSuggestions(
      ["rust programming", "rust language", "rust tutorial"],
      "rust",
      8,
    );
    expect(suggestions).toEqual(["rust programming", "rust language", "rust tutorial"]);
  });

  test("excludes terms that match the query (case-insensitive)", () => {
    const suggestions = normalizeSidebarSuggestions(
      ["Rust", "rust", "RUST", "rust programming"],
      "rust",
      8,
    );
    expect(suggestions).toEqual(["rust programming"]);
  });

  test("excludes terms that match the query when query has surrounding whitespace", () => {
    const suggestions = normalizeSidebarSuggestions(
      ["rust", "rust programming"],
      "  rust  ",
      8,
    );
    expect(suggestions).toEqual(["rust programming"]);
  });

  test("deduplicates terms case-insensitively", () => {
    const suggestions = normalizeSidebarSuggestions(
      ["Rust Programming", "rust programming", "RUST PROGRAMMING", "rust tutorial"],
      "search",
      8,
    );
    expect(suggestions).toEqual(["Rust Programming", "rust tutorial"]);
  });

  test("trims whitespace from string items", () => {
    const suggestions = normalizeSidebarSuggestions(
      ["  hello world  ", "\ttab term\t"],
      "query",
      8,
    );
    expect(suggestions).toEqual(["hello world", "tab term"]);
  });

  test("skips items with empty or whitespace-only text", () => {
    const suggestions = normalizeSidebarSuggestions(
      [{ text: "" }, { text: "   " }, { text: "valid term" }],
      "query",
      8,
    );
    expect(suggestions).toEqual(["valid term"]);
  });

  test("handles items with null text property", () => {
    const suggestions = normalizeSidebarSuggestions(
      [{ text: null }, { text: "valid" }],
      "query",
      8,
    );
    expect(suggestions).toEqual(["valid"]);
  });

  test("handles items with numeric text property by converting to string", () => {
    const suggestions = normalizeSidebarSuggestions(
      [{ text: 42 }, { text: "real term" }],
      "query",
      8,
    );
    expect(suggestions).toEqual(["42", "real term"]);
  });

  test("skips primitive non-string, non-object items", () => {
    const suggestions = normalizeSidebarSuggestions(
      [true, false, null, 0, "valid term"],
      "query",
      8,
    );
    expect(suggestions).toEqual(["valid term"]);
  });

  test("uses default limit of 8 when not specified", () => {
    const suggestions = normalizeSidebarSuggestions(
      Array.from({ length: 20 }, (_, i) => `term ${i}`),
      "something",
    );
    expect(suggestions).toHaveLength(8);
  });

  test("respects custom limit of 1", () => {
    const suggestions = normalizeSidebarSuggestions(
      ["alpha", "beta", "gamma"],
      "query",
      1,
    );
    expect(suggestions).toEqual(["alpha"]);
  });

  test("respects custom limit of 0 - returns empty", () => {
    const suggestions = normalizeSidebarSuggestions(
      ["alpha", "beta"],
      "query",
      0,
    );
    expect(suggestions).toEqual([]);
  });

  test("preserves original casing of first occurrence", () => {
    const suggestions = normalizeSidebarSuggestions(
      ["TypeScript", "typescript", "JavaScript"],
      "search",
      8,
    );
    expect(suggestions[0]).toBe("TypeScript");
    expect(suggestions[1]).toBe("JavaScript");
  });

  test("handles array with only items matching the query", () => {
    const suggestions = normalizeSidebarSuggestions(
      ["rust", "Rust", "RUST"],
      "rust",
      8,
    );
    expect(suggestions).toEqual([]);
  });

  test("mixed string and object items are processed correctly", () => {
    const suggestions = normalizeSidebarSuggestions(
      ["plain string", { text: "object term" }, "another plain"],
      "query",
      8,
    );
    expect(suggestions).toEqual(["plain string", "object term", "another plain"]);
  });
});
