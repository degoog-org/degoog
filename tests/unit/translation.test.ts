import { describe, expect, test, afterEach } from "bun:test";
import { getClosestLanguage } from "../../src/server/utils/translation";
import { getLocale } from "../../src/server/utils/hono";

const mockCtx = (acceptLang?: string) =>
  ({
    req: { header: (h: string) => (h === "Accept-Language" ? acceptLang : undefined) },
  }) as Parameters<typeof getLocale>[0];

describe("getClosestLanguage", () => {
  test("returns exact match when present", () => {
    expect(getClosestLanguage("en-US", ["en-US", "fr-FR"])).toBe("en-US");
  });

  test("maps regional tag to first available same base language bundle", () => {
    expect(getClosestLanguage("en-GB", ["en-US", "fr-FR"])).toBe("en-US");
  });

  test("maps base tag to first available regional bundle", () => {
    expect(getClosestLanguage("en", ["en-US", "fr-FR"])).toBe("en-US");
  });

  test("returns first en-prefixed bundle when no base match", () => {
    expect(getClosestLanguage("de", ["en-US", "fr-FR"])).toBe("en-US");
  });

  test("returns null when list empty", () => {
    expect(getClosestLanguage("en", [])).toBeNull();
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

  test("returns undefined when DEGOOG_I18N unset and no Accept-Language", () => {
    expect(getLocale(mockCtx())).toBeUndefined();
  });

  test("treats whitespace-only DEGOOG_I18N as unset", () => {
    process.env.DEGOOG_I18N = "   ";
    expect(getLocale(mockCtx("de"))).toBe("de");
  });
});
