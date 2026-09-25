import { describe, expect, test } from "bun:test";
import {
  SHORTCUT_ACTIONS,
  parseShortcutsMap,
} from "../../../src/shared/shortcuts";
import { formatBinding } from "../../../src/client/shortcuts/binding";
import { parseShortcutMetaFromSource } from "../../../src/server/extensions/store/item-metadata";

describe("shortcuts shared model", () => {
  test("action ids are unique and every action has a default binding", () => {
    const ids = SHORTCUT_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const action of SHORTCUT_ACTIONS) {
      if (action.kind === "numeric") {
        expect(
          Boolean(
            action.defaultBinding.ctrl ||
              action.defaultBinding.meta ||
              action.defaultBinding.alt ||
              action.defaultBinding.shift,
          ),
        ).toBe(true);
      } else {
        expect(action.defaultBinding.key).toBeString();
      }
    }
  });

  test("formatBinding renders single and numeric bindings", () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { platform: "Linux x86_64", userAgent: "Linux x86_64" },
      configurable: true,
    });
    try {
      expect(formatBinding({ key: "k", ctrl: true })).toBe("Ctrl + K");
      expect(formatBinding({ key: "ArrowLeft", alt: true })).toBe("Alt + Left");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: original,
        configurable: true,
      });
    }
  });

  test("formatBinding labels the meta key per platform", () => {
    const original = globalThis.navigator;
    const stub = (platform: string): void => {
      Object.defineProperty(globalThis, "navigator", {
        value: { platform, userAgent: platform },
        configurable: true,
      });
    };
    try {
      stub("MacIntel");
      expect(formatBinding({ meta: true, alt: true }, "numeric")).toBe(
        "⌥ + ⌘ + 1-9",
      );
      stub("Win32");
      expect(formatBinding({ meta: true, alt: true }, "numeric")).toBe(
        "Alt + Win + 1-9",
      );
      stub("Linux x86_64");
      expect(formatBinding({ meta: true, alt: true }, "numeric")).toBe(
        "Alt + Super + 1-9",
      );
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: original,
        configurable: true,
      });
    }
  });

  test("parseShortcutsMap validates and normalizes shortcut overrides", () => {
    const actions = [
      ...SHORTCUT_ACTIONS,
      {
        id: "tab-by-number",
        kind: "numeric" as const,
        defaultBinding: { alt: true },
      },
    ];
    expect(
      parseShortcutsMap({
        "focus-search": { key: "k", ctrl: true },
        "tab-by-number": { key: "1", alt: true },
      }, actions),
    ).toEqual({
      "focus-search": { key: "k", ctrl: true },
      "tab-by-number": { alt: true },
    });

    expect(parseShortcutsMap({ unknown: { key: "x" } })).toBeNull();
    expect(parseShortcutsMap({ "focus-search": { ctrl: true } })).toBeNull();
    expect(parseShortcutsMap({ "focus-search": { key: "x", extra: true } })).toBeNull();
    expect(parseShortcutsMap({ "tab-by-number": { key: "1" } }, actions)).toBeNull();
  });

  test("parseShortcutMetaFromSource extracts the default binding for keycaps", () => {
    const single = `export default {
      name: "Next tab",
      defaultBinding: { key: "ArrowRight", alt: true },
      run({ document }) { document.querySelector("a")?.click(); },
    };`;
    expect(parseShortcutMetaFromSource(single)).toEqual({
      binding: { key: "ArrowRight", alt: true },
      kind: "single",
    });

    const numeric = `export default {
      name: "Switch tab by number",
      kind: "numeric",
      defaultBinding: { alt: true },
      run({ event }) { const n = Number(event?.key); },
    };`;
    expect(parseShortcutMetaFromSource(numeric)).toEqual({
      binding: { alt: true },
      kind: "numeric",
    });

    expect(parseShortcutMetaFromSource("export default { name: 'x' };")).toBeNull();
  });
});
