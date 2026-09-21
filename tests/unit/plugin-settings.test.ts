import { describe, test, expect } from "bun:test";
import {
  asBoolean,
  asString,
  maskSecrets,
  mergeSecrets,
} from "../../src/server/utils/plugin-settings";

describe("plugin-settings", () => {
  test("asBoolean only accepts the boolean true and the exact string \"true\"", () => {
    const cases: [Parameters<typeof asBoolean>[0], boolean][] = [
      [true, true],
      ["true", true],
      [false, false],
      ["false", false],
      [undefined, false],
      ["", false],
      ["1", false],
      ["TRUE", false],
      [["true"], false],
    ];
    for (const [input, expected] of cases) {
      expect(asBoolean(input)).toBe(expected);
    }
  });

  test("asString renders booleans", () => {
    expect(asString(true)).toBe("true");
    expect(asString(false)).toBe("false");
  });

  describe("maskSecrets", () => {
    test("masks set secrets with __SET__ and leaves other values alone", () => {
      const settings = { apiKey: "secret123", name: "foo", unknown: "v" };
      const schema = [
        { key: "apiKey", secret: true },
        { key: "name", secret: false },
      ];
      const result = maskSecrets(settings, schema);
      expect(result.apiKey).toBe("__SET__");
      expect(result.name).toBe("foo");
      expect(result.unknown).toBe("v");
    });

    test("masks secret fields with empty string when value is falsy", () => {
      const settings = { apiKey: "" };
      const schema = [{ key: "apiKey", secret: true }];
      const result = maskSecrets(settings, schema);
      expect(result.apiKey).toBe("");
    });
  });

  describe("mergeSecrets", () => {
    test("keeps existing secret when incoming is __SET__", () => {
      const incoming = { apiKey: "__SET__", url: "https://new.com" };
      const existing = { apiKey: "real-secret", url: "https://old.com" };
      const schema = [
        { key: "apiKey", secret: true },
        { key: "url", secret: false },
      ];
      const result = mergeSecrets(incoming, existing, schema);
      expect(result.apiKey).toBe("real-secret");
      expect(result.url).toBe("https://new.com");
    });

    test("overwrites secret when incoming has real value", () => {
      const incoming = { apiKey: "new-secret" };
      const existing = { apiKey: "old" };
      const schema = [{ key: "apiKey", secret: true }];
      const result = mergeSecrets(incoming, existing, schema);
      expect(result.apiKey).toBe("new-secret");
    });
  });
});
