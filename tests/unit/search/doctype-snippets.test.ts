import { describe, expect, test } from "bun:test";
import { looksLikeProse } from "../../../src/server/utils/text";
import { scoreResults } from "../../../src/server/search/scoring";

const PURILI_PAGE_SOURCE =
  'UBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> Floating Tradition TraditionDATA Finacor ParFX StreamingEdge Tradition Green Tradition Securities and Derivatives Tradition Energy Tra';

const PAGE_SOURCE_HEADS = [
  PURILI_PAGE_SOURCE,
  'UBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"> Eiffel Tower The Eiffel Tower All photographs © 2009 by Jamie McKenzie, all rights reserved.',
  '…"-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> Guide to the first discussion draft of AGPLv3 — GPLv3 Skip',
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"><html><head><title>Floating</title></head>',
];

const LEGIT_SNIPPETS = [
  'The Python docs say "floating point numbers are usually implemented using double in C" and explain why 0.1 + 0.2 is not exactly 0.3.',
  "Read https://floating-point-gui.de/basic/ for a short guide to why floating point arithmetic gives surprising results in every language.",
  "The loop keeps running while x < 5 and stops as soon as the counter reaches the limit set by the caller.",
  'This doctype is used in an XHTML document when you are not using any framset or depreciated tags. <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http',
];

const snippetOf = (snippet: string): string =>
  scoreResults([
    { results: [{ title: "Floating", url: "https://example.com/a", snippet, source: "E1" }] },
  ])[0].snippet;

describe("snippets that start with a doctype", () => {
  test.each(PAGE_SOURCE_HEADS)("drops page source as a snippet: %s", (raw) => {
    expect(snippetOf(raw)).toBe("");
  });

  test.each(LEGIT_SNIPPETS)("keeps a normal snippet as is: %s", (raw) => {
    expect(snippetOf(raw)).toBe(raw);
  });

  test("a real snippet from another engine wins over the longer page source", () => {
    const [merged] = scoreResults([
      { results: [{ title: "Floating", url: "https://example.com/a", snippet: PURILI_PAGE_SOURCE, source: "Purili" }] },
      { results: [{ title: "Floating", url: "https://example.com/a", snippet: LEGIT_SNIPPETS[0], source: "Brave" }] },
    ]);
    expect(merged.snippet).toBe(LEGIT_SNIPPETS[0]);
  });

  test("never reads as prose for the glance box", () => {
    expect(looksLikeProse(PURILI_PAGE_SOURCE)).toBe(false);
    for (const snippet of LEGIT_SNIPPETS.slice(0, 3)) {
      expect(looksLikeProse(snippet)).toBe(true);
    }
  });
});
