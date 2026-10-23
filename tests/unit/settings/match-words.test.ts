import { describe, expect, test } from "bun:test";
import { matchesWords } from "../../../src/client/settings/shared/filter/match-words";

const FIELDS = ["Calm Green", "Soft green theme", "fccview", "official-extensions"];

describe("matchesWords", () => {
  test("blank query matches everything", () => {
    expect(matchesWords(FIELDS, "   ")).toBe(true);
  });

  test("every word must match, in any order and across fields", () => {
    expect(matchesWords(FIELDS, "theme calm")).toBe(true);
    expect(matchesWords(FIELDS, "fccview official")).toBe(true);
    expect(matchesWords(FIELDS, "green weather")).toBe(false);
  });

  test("ignores case and extra whitespace", () => {
    expect(matchesWords(FIELDS, "  SOFT   Green ")).toBe(true);
  });

  test("a word never spans two fields", () => {
    expect(matchesWords(["abc", "def"], "cd")).toBe(false);
  });

  test("skips missing fields", () => {
    expect(matchesWords([undefined, "Weather"], "weather")).toBe(true);
  });
});
