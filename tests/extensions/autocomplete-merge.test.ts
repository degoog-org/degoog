import { describe, test, expect } from "bun:test";
import { mergeSuggestions } from "../../src/server/extensions/autocomplete/merge";

describe("mergeSuggestions", () => {
  test("drops the exact query echo and dedupes across providers", () => {
    const merged = mergeSuggestions(
      [
        { results: ["cat", "cats", "cat food"], name: "A" },
        { results: ["cat", "cats"], name: "B" },
      ],
      "cat",
    );
    const texts = merged.map((m) => m.text);
    expect(texts).not.toContain("cat");
    expect(texts).toContain("cats");
    const cats = merged.find((m) => m.text === "cats");
    expect(cats?.source).toContain("A");
    expect(cats?.source).toContain("B");
  });

  test("caps total suggestions at 10", () => {
    const many = Array.from({ length: 20 }, (_, i) => `s${i}`);
    const merged = mergeSuggestions([{ results: many, name: "A" }], "q");
    expect(merged.length).toBeLessThanOrEqual(10);
  });

  test("keeps rich suggestions first and limits them to 2", () => {
    const merged = mergeSuggestions(
      [
        {
          results: [
            { text: "alpha", rich: { description: "a" } },
            { text: "beta", rich: { thumbnail: "b.png" } },
            { text: "gamma", rich: { description: "c" } },
            "plain1",
          ],
          name: "A",
        },
      ],
      "q",
    );
    const richCount = merged.filter((m) => m.rich).length;
    expect(richCount).toBe(2);
    expect(merged[0].rich).toBeDefined();
  });

  test("decodes html entities before filtering and deduping", () => {
    const merged = mergeSuggestions(
      [
        {
          results: [
            "&#23398;&#20013;&#25991;",
            "&#23398;&#20013;&#25991;&#30340;app",
          ],
          name: "Google",
        },
        { results: ["学中文的app", "Tom &amp; Jerry"], name: "DuckDuckGo" },
      ],
      "学中文",
    );

    expect(merged.map((m) => m.text)).toEqual([
      "学中文的app",
      "Tom & Jerry",
    ]);
    expect(merged[0].source).toContain("Google");
    expect(merged[0].source).toContain("DuckDuckGo");
  });

  test("decodes rich suggestion text and string metadata", () => {
    const merged = mergeSuggestions(
      [
        {
          results: [
            {
              text: "&#x5B66;&#x4E2D;&#x6587; app",
              rich: {
                description: "Learn &quot;Chinese&quot;",
                type: "App &amp; Course",
              },
            },
          ],
          name: "Google",
        },
      ],
      "q",
    );

    expect(merged[0]).toMatchObject({
      text: "学中文 app",
      rich: {
        description: 'Learn "Chinese"',
        type: "App & Course",
      },
    });
  });
});
