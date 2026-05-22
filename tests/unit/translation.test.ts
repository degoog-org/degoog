import { describe, expect, test, afterEach } from "bun:test";
import { matchField } from "../../src/server/utils/translation-circuit";
import { getLocale } from "../../src/server/utils/hono";

const mockCtx = (acceptLang?: string) =>
  ({
    req: {
      header: (h: string) => (h === "Accept-Language" ? acceptLang : undefined),
    },
  }) as Parameters<typeof getLocale>[0];

describe("matchField", () => {
  test("returns exact match when present", () => {
    expect(matchField("en-US", ["en-US", "fr-FR"])).toBe("en-US");
  });

  test("maps regional tag to first available same base language bundle", () => {
    expect(matchField("en-GB", ["en-US", "fr-FR"])).toBe("en-US");
  });

  test("maps base tag to first available regional bundle", () => {
    expect(matchField("en", ["en-US", "fr-FR"])).toBe("en-US");
  });

  test("returns first en-prefixed bundle when no base match", () => {
    expect(matchField("de", ["en-US", "fr-FR"])).toBe("en-US");
  });

  test("prefers en-US over it when locale is en but only non-en bundles exist besides en", () => {
    expect(matchField("en", ["it", "en-US", "fr-FR"])).toBe("en-US");
  });

  test("returns alphabetically first bundle when no match and no English bundle exists", () => {
    expect(matchField("en", ["it", "fr-FR"])).toBe("fr-FR");
  });

  test("prefers en-US over it when forced en and extension has no en base match", () => {
    expect(matchField("en", ["it", "en-US"])).toBe("en-US");
  });

  test("picks same-base bundle when english is absent", () => {
    expect(matchField("fr-CA", ["it", "fr-FR"])).toBe("fr-FR");
  });

  test("returns null when list empty", () => {
    expect(matchField("en", [])).toBeNull();
  });
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
