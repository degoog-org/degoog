import { describe, expect, test } from "bun:test";
import * as sass from "sass";

const WRAPS = ["degoog-toggle-wrap", "degoog-checkbox-wrap"];

const css = sass.compile("src/styles/style.scss", {
  silenceDeprecations: ["import"],
}).css;

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].split(",").map((s) => s.trim()),
  body: m[2],
}));

const _wrapInputRules = () =>
  rules.filter((r) =>
    r.selectors.some(
      (s) => WRAPS.some((w) => s.includes(`.${w}`)) && /\binput$/.test(s),
    ),
  );

describe("toggle and checkbox inputs stay keyboard reachable", () => {
  test("the shared wraps style their inputs", () => {
    expect(_wrapInputRules().length).toBeGreaterThan(0);
  });

  test("no wrap input rule removes the input from the tab order", () => {
    const offenders = _wrapInputRules()
      .filter((r) => /display:\s*none|visibility:\s*hidden/.test(r.body))
      .map((r) => r.selectors.join(", "));
    expect(offenders).toEqual([]);
  });

  test.each(["degoog-toggle", "degoog-checkbox"])(
    "a focused input outlines its .%s",
    (cls) => {
      const ring = rules.find((r) =>
        r.selectors.includes(`input:focus-visible + .${cls}`),
      );
      expect(ring?.body ?? "").toMatch(/outline:\s*2px solid/);
    },
  );
});
