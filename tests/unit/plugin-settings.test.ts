import { describe, test, expect } from "bun:test";
import {
  asBoolean,
  asString,
  maskSecrets,
  mergeSecrets,
} from "../../src/server/utils/plugin-settings";

describe("plugin-settings", () => {
  describe("asBoolean", () => {
    test("boolean true → true", () => expect(asBoolean(true)).toBe(true));
    test("boolean false → false", () => expect(asBoolean(false)).toBe(false));
    test('string "true" → true', () => expect(asBoolean("true")).toBe(true));
    test('string "false" → false', () => expect(asBoolean("false")).toBe(false));
    test("undefined → false", () => expect(asBoolean(undefined)).toBe(false));
    test('empty string → false', () => expect(asBoolean("")).toBe(false));
    test('string "1" → false (not truthy-coerced)', () => expect(asBoolean("1")).toBe(false));
    test('string "TRUE" → false (case-sensitive)', () => expect(asBoolean("TRUE")).toBe(false));
    test("string array → false", () => expect(asBoolean(["true"])).toBe(false));
  });

  describe("asString with boolean input", () => {
    test("boolean true → \"true\"", () => expect(asString(true)).toBe("true"));
    test("boolean false → \"false\"", () => expect(asString(false)).toBe("false"));
  });

  describe("maskSecrets", () => {
    test("masks secret fields with __SET__ when value is set", () => {
      const settings = { apiKey: "secret123", name: "foo" };
      const schema = [
        { key: "apiKey", secret: true },
        { key: "name", secret: false },
      ];
      const result = maskSecrets(settings, schema);
      expect(result.apiKey).toBe("__SET__");
      expect(result.name).toBe("foo");
    });

    test("masks secret fields with empty string when value is falsy", () => {
      const settings = { apiKey: "" };
      const schema = [{ key: "apiKey", secret: true }];
      const result = maskSecrets(settings, schema);
      expect(result.apiKey).toBe("");
    });

    test("leaves non-secret fields unchanged", () => {
      const settings = { url: "https://x.com", token: "t" };
      const schema = [{ key: "url" }, { key: "token", secret: true }];
      const result = maskSecrets(settings, schema);
      expect(result.url).toBe("https://x.com");
      expect(result.token).toBe("__SET__");
    });

    test("handles unknown keys by leaving value as-is", () => {
      const settings = { unknown: "v" };
      const schema: { key: string; secret?: boolean }[] = [];
      const result = maskSecrets(settings, schema);
      expect(result.unknown).toBe("v");
    });
  });

  describe("mergeSecrets", () => {
    test("keeps existing secret when incoming is __SET__", () => {
      const incoming = { apiKey: "__SET__" };
      const existing = { apiKey: "real-secret" };
      const schema = [{ key: "apiKey", secret: true }];
      const result = mergeSecrets(incoming, existing, schema);
      expect(result.apiKey).toBe("real-secret");
    });

    test("overwrites secret when incoming has real value", () => {
      const incoming = { apiKey: "new-secret" };
      const existing = { apiKey: "old" };
      const schema = [{ key: "apiKey", secret: true }];
      const result = mergeSecrets(incoming, existing, schema);
      expect(result.apiKey).toBe("new-secret");
    });

    test("overwrites non-secret fields from incoming", () => {
      const incoming = { name: "new-name" };
      const existing = { name: "old-name" };
      const schema = [{ key: "name" }];
      const result = mergeSecrets(incoming, existing, schema);
      expect(result.name).toBe("new-name");
    });

    test("merges multiple keys", () => {
      const incoming = { apiKey: "__SET__", url: "https://new.com" };
      const existing = { apiKey: "keep-me", url: "https://old.com" };
      const schema = [
        { key: "apiKey", secret: true },
        { key: "url", secret: false },
      ];
      const result = mergeSecrets(incoming, existing, schema);
      expect(result.apiKey).toBe("keep-me");
      expect(result.url).toBe("https://new.com");
    });
  });
});
