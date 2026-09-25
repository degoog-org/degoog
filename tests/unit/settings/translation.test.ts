import { describe, expect, test, afterEach } from "bun:test";
import { matchField } from "../../../src/server/utils/extension-support/translation-circuit";
import { getLocale } from "../../../src/server/utils/hono";

const mockCtx = (acceptLang?: string) =>
  ({
    req: {
      header: (h: string) => (h === "Accept-Language" ? acceptLang : undefined),
    },
  }) as Parameters<typeof getLocale>[0];

describe("matchField", () => {
  const cases: [string, string, string[], string | null][] = [
    ["exact match wins", "en-US", ["en-US", "fr-FR"], "en-US"],
    ["regional tag falls back to the same base language", "en-GB", ["en-US", "fr-FR"], "en-US"],
    ["base tag falls back to a regional bundle", "en", ["en-US", "fr-FR"], "en-US"],
    ["no base match falls back to english", "de", ["en-US", "fr-FR"], "en-US"],
    ["english missing falls back to the first bundle", "en", ["it", "fr-FR"], "fr-FR"],
    ["english is preferred over bundle order", "en", ["it", "en-US"], "en-US"],
    ["same-base bundle beats english absence", "fr-CA", ["it", "fr-FR"], "fr-FR"],
    ["an empty bundle list has no match", "en", [], null],
  ];

  for (const [name, locale, bundles, expected] of cases) {
    test(name, () => {
      expect(matchField(locale, bundles)).toBe(expected);
    });
  }
});

describe("getLocale", () => {
  afterEach(() => {
    delete process.env.DEGOOG_I18N;
  });

  test("returns DEGOOG_I18N when set, ignoring Accept-Language", () => {
    process.env.DEGOOG_I18N = "fr";
    expect(getLocale(mockCtx("en-US"))).toBe("fr");
  });

  test("trims DEGOOG_I18N whitespace", () => {
    process.env.DEGOOG_I18N = "  fr  ";
    expect(getLocale(mockCtx())).toBe("fr");
  });

  test("falls back to Accept-Language when DEGOOG_I18N is unset", () => {
    expect(getLocale(mockCtx("en-GB,en;q=0.9"))).toBe("en-GB");
  });

  test('defaults to "en" when DEGOOG_I18N unset and no Accept-Language', () => {
    expect(getLocale(mockCtx())).toBe("en");
  });

  test("treats whitespace-only DEGOOG_I18N as unset", () => {
    process.env.DEGOOG_I18N = "   ";
    expect(getLocale(mockCtx("de"))).toBe("de");
  });
});
