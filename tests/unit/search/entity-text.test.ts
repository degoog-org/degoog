import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { decodeEntities } from "../../../src/server/utils/text";
import { scoreResults } from "../../../src/server/search/scoring";
import { renderTemplateString } from "../../../src/shared/template/index";
import { renderGlanceBox } from "../../../src/server/extensions/commands/builtins/at-a-glance/render";
import { DEGOOG_ENGINE_NAME, type ScoredResult } from "../../../src/shared/search-types";

const RESULT_TEMPLATE = readFileSync(
  join(
    import.meta.dir,
    "../../../src/public/themes/degoog-theme/search-templates/result.html",
  ),
  "utf-8",
);

const scoreOne = (title: string, snippet: string, source = "E1"): ScoredResult =>
  scoreResults([
    { results: [{ title, url: "https://example.com/a", snippet, source }] },
  ])[0];

describe("decodeEntities", () => {
  test("decodes named entities", () => {
    expect(decodeEntities("Tom &amp; Jerry &middot; &quot;cartoon&quot; &hellip;")).toBe(
      'Tom & Jerry · "cartoon" …',
    );
    expect(decodeEntities("&lsquo;a&rsquo; &ldquo;b&rdquo; &mdash; &ndash; &copy; &trade;")).toBe(
      "‘a’ “b” — – © ™",
    );
  });

  test("decodes decimal and hex entities", () => {
    expect(decodeEntities("O&#039;Reilly, O&#39;Reilly, O&#x27;Reilly, O&#X27;Reilly")).toBe(
      "O'Reilly, O'Reilly, O'Reilly, O'Reilly",
    );
    expect(decodeEntities("&#128640; &#x1F680;")).toBe("🚀 🚀");
  });

  test("decodes once, so an escaped entity stays as text", () => {
    expect(decodeEntities("&amp;lt;b&amp;gt; and &amp;amp;")).toBe("&lt;b&gt; and &amp;");
  });

  test("leaves unknown, invalid and incomplete entities as they are", () => {
    for (const text of [
      "&notanentity;",
      "&constructor; &toString; &__proto__;",
      "&#0; &#xD800; &#x110000;",
      "AT&T and R&D",
      "&amp without a semicolon",
    ]) {
      expect(decodeEntities(text)).toBe(text);
    }
  });
});

describe("result text with entities", () => {
  test("decodes the title and snippet", () => {
    const result = scoreOne(
      "O&#039;Reilly &amp; Associates",
      "Books &middot; &quot;Learning Python&quot; by Mark Lutz&#x27;s team",
    );
    expect(result.title).toBe("O'Reilly & Associates");
    expect(result.snippet).toBe('Books · "Learning Python" by Mark Lutz\'s team');
  });

  test("keeps escaped markup as text instead of stripping it", () => {
    const result = scoreOne(
      "How to center a &lt;div&gt;",
      "<b>Use</b> &lt;script&gt;alert(1)&lt;/script&gt; as text",
    );
    expect(result.title).toBe("How to center a <div>");
    expect(result.snippet).toBe("Use <script>alert(1)</script> as text");
  });

  test("keeps decoded markup in text recalled from the index", () => {
    const result = scoreOne(
      "How to center a <div>",
      "Wrap it in <main> &amp; set display: grid",
      DEGOOG_ENGINE_NAME,
    );
    expect(result.title).toBe("How to center a <div>");
    expect(result.snippet).toBe("Wrap it in <main> & set display: grid");
  });

  test("reads a date before a decoded separator", () => {
    const result = scoreOne(
      "Mars rover",
      "Nov 9, 2026 &middot; The rover reached the rim of the crater on Sunday.",
    );
    expect(result.publishedAt).toBe("2026-11-09");
    expect(result.snippet).toBe("The rover reached the rim of the crater on Sunday.");
  });

  test("drops an escaped doctype as page source", () => {
    expect(
      scoreOne("Floating", "UBLIC &quot;-//W3C//DTD XHTML 1.0 Transitional//EN&quot;&gt; Floating").snippet,
    ).toBe("");
  });

  test("decoded markup renders as text", () => {
    const result = scoreOne(
      "&lt;img src=x onerror=alert(1)&gt;",
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    const html = renderTemplateString(RESULT_TEMPLATE, {
      title: result.title,
      snippet: result.snippet,
      url: result.url,
      sources: [],
    });
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");

    const glance = renderGlanceBox({
      snippet: result.snippet,
      title: result.title,
      url: result.url,
      foundOn: "",
    });
    expect(glance).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(glance).not.toContain("<script>");
  });
});
