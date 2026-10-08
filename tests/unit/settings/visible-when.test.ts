import { describe, expect, test } from "bun:test";
import type { SettingField } from "../../../src/shared/setting-field";
import { isFieldVisible, ruleMatches } from "../../../src/shared/visible-when";

const schema: SettingField[] = [
  { key: "enabled", label: "Enabled", type: "toggle", default: "true" },
  {
    key: "provider",
    label: "Provider",
    type: "select",
    options: ["a", "b", "c"],
    default: "a",
    visibleWhen: { key: "enabled", equals: "true" },
  },
  {
    key: "token",
    label: "Token",
    type: "text",
    required: true,
    visibleWhen: { key: "provider", equals: ["b", "c"] },
  },
  {
    key: "region",
    label: "Region",
    type: "text",
    visibleWhen: [
      { key: "provider", equals: "c" },
      { key: "enabled", equals: "true" },
    ],
  },
];

const field = (key: string): SettingField =>
  schema.find((f) => f.key === key)!;

describe("visibleWhen", () => {
  test("a single value matches exactly", () => {
    expect(ruleMatches({ key: "x", equals: "a" }, "a")).toBe(true);
    expect(ruleMatches({ key: "x", equals: "a" }, "b")).toBe(false);
  });

  test("a list matches any of its values", () => {
    expect(ruleMatches({ key: "x", equals: ["a", "b"] }, "b")).toBe(true);
    expect(ruleMatches({ key: "x", equals: ["a", "b"] }, "c")).toBe(false);
  });

  test("toggle values normalise to true and false", () => {
    expect(ruleMatches({ key: "x", equals: "false" }, "")).toBe(true);
    expect(ruleMatches({ key: "x", equals: "true" }, true)).toBe(true);
  });

  test("free text never reads as a false toggle", () => {
    expect(ruleMatches({ key: "x", equals: "false" }, "https://example.com")).toBe(false);
    expect(ruleMatches({ key: "x", notEquals: "false" }, "https://example.com")).toBe(true);
  });

  test("falls back to the dependency default when unset", () => {
    expect(isFieldVisible(field("provider"), schema, {})).toBe(true);
    expect(isFieldVisible(field("token"), schema, {})).toBe(false);
  });

  test("shows a field when the dropdown picks one of its values", () => {
    expect(isFieldVisible(field("token"), schema, { provider: "b" })).toBe(true);
    expect(isFieldVisible(field("token"), schema, { provider: "c" })).toBe(true);
  });

  test("every rule in a list has to match", () => {
    expect(isFieldVisible(field("region"), schema, { provider: "c" })).toBe(true);
    expect(
      isFieldVisible(field("region"), schema, { provider: "c", enabled: "false" }),
    ).toBe(false);
  });

  test("hiding a dependency hides the fields that hang off it", () => {
    expect(
      isFieldVisible(field("token"), schema, { provider: "b", enabled: "false" }),
    ).toBe(false);
  });

  test("notEquals shows a field while the value is anything else", () => {
    const form: SettingField[] = [
      { key: "url", label: "URL", type: "url" },
      { key: "timeout", label: "Timeout", type: "text", visibleWhen: { key: "url", notEquals: "" } },
    ];
    expect(isFieldVisible(form[1], form, {})).toBe(false);
    expect(isFieldVisible(form[1], form, { url: "http://x" })).toBe(true);
  });

  test("anyOf matches when any branch matches", () => {
    const form: SettingField[] = [
      { key: "useContainer", label: "Containers", type: "toggle", default: "true" },
      { key: "proxyType", label: "Proxy", type: "select", default: "none" },
      {
        key: "pool",
        label: "Pool",
        type: "text",
        visibleWhen: {
          anyOf: [
            { key: "useContainer", equals: "true" },
            { key: "proxyType", notEquals: "none" },
          ],
        },
      },
    ];
    expect(isFieldVisible(form[2], form, {})).toBe(true);
    expect(isFieldVisible(form[2], form, { useContainer: "false" })).toBe(false);
    expect(
      isFieldVisible(form[2], form, { useContainer: "false", proxyType: "socks5" }),
    ).toBe(true);
  });

  test("a masked secret counts as set", () => {
    const form: SettingField[] = [
      { key: "apiToken", label: "Token", type: "password", secret: true },
      { key: "username", label: "User", type: "text", visibleWhen: { key: "apiToken", equals: "" } },
    ];
    expect(isFieldVisible(form[1], form, { apiToken: "__SET__" })).toBe(false);
    expect(isFieldVisible(form[1], form, { apiToken: "" })).toBe(true);
  });

  test("malformed rules are ignored", () => {
    const form = [
      { key: "a", label: "A", type: "text", visibleWhen: { key: "b" } },
    ] as unknown as SettingField[];
    expect(isFieldVisible(form[0], form, {})).toBe(true);
  });

  test("a cycle hides the field instead of looping", () => {
    const loop: SettingField[] = [
      { key: "a", label: "A", type: "text", visibleWhen: { key: "b", equals: "" } },
      { key: "b", label: "B", type: "text", visibleWhen: { key: "a", equals: "" } },
    ];
    expect(isFieldVisible(loop[0], loop, {})).toBe(false);
  });
});
