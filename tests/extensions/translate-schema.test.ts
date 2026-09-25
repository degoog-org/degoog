import { describe, expect, test } from "bun:test";
import { translateSchema } from "../../src/server/extensions/extension-meta";
import type { SettingField } from "../../src/shared/setting-field";
import type { Translate } from "../../src/server/types/extension";

const schema: SettingField[] = [
  { key: "apiKey", label: "API key", type: "password", description: "raw desc", placeholder: "raw ph" },
  { key: "plain", label: "Plain", type: "text" },
];

const dict: Record<string, string> = {
  "demo-plugin.settings.apiKey.label": "Clé API",
  "demo-plugin.settings.apiKey.description": "desc fr",
  "demo-plugin.settings.plain.description": "never used, field has none",
  "demo-plugin.settings.plain.placeholder": "never used either",
};

const t = ((key: string) => dict[key] ?? key) as unknown as Translate;

describe("translateSchema", () => {
  test("no translator hands back the same schema", () => {
    expect(translateSchema("demo-plugin", schema, undefined)).toBe(schema);
  });

  test("translated keys replace the raw text, untranslated keys keep it", () => {
    expect(translateSchema("demo-plugin", schema, t)).toEqual([
      { key: "apiKey", label: "Clé API", type: "password", description: "desc fr", placeholder: "raw ph" },
      { key: "plain", label: "Plain", type: "text" },
    ]);
  });

  test("a translated placeholder replaces the raw one", () => {
    const withPh = ((key: string) =>
      key === "x.settings.apiKey.placeholder" ? "ph fr" : key) as unknown as Translate;
    expect(translateSchema("x", schema, withPh)[0].placeholder).toBe("ph fr");
  });
});
