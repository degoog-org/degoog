import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { focusableIn, wrapTab } from "../../../src/client/utils/dom/focus-trap";

interface FakeFocusable {
  name: string;
  attrs: Record<string, string>;
  laidOut: boolean;
  hasAttribute: (name: string) => boolean;
  getAttribute: (name: string) => string | null;
  getClientRects: () => { length: number };
  focus: () => void;
}

const doc = { activeElement: null as unknown };

const el = (
  name: string,
  attrs: Record<string, string> = {},
  laidOut = true,
): FakeFocusable => {
  const node: FakeFocusable = {
    name,
    attrs,
    laidOut,
    hasAttribute: (key) => key in attrs,
    getAttribute: (key) => attrs[key] ?? null,
    getClientRects: () => ({ length: laidOut ? 1 : 0 }),
    focus: () => {
      doc.activeElement = node;
    },
  };
  return node;
};

const dialogOf = (children: FakeFocusable[]) => {
  const root = {
    querySelectorAll: () => children,
    contains: (target: unknown) =>
      target === root || children.includes(target as FakeFocusable),
    focus: () => {
      doc.activeElement = root;
    },
  };
  return root as unknown as HTMLElement & { focus: () => void };
};

const press = (shiftKey = false, defaultPrevented = false) => {
  const event = {
    key: "Tab",
    shiftKey,
    defaultPrevented,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  return event;
};

const nameOfActive = (): string =>
  (doc.activeElement as FakeFocusable | null)?.name ?? "";

let saved: unknown;
beforeEach(() => {
  saved = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = doc;
  doc.activeElement = null;
});
afterEach(() => {
  (globalThis as { document?: unknown }).document = saved;
});

describe("focusableIn", () => {
  test("skips disabled, hidden, unlaid-out and tabindex -1 elements", () => {
    const keep = el("keep");
    const root = dialogOf([
      el("disabled", { disabled: "" }),
      el("hidden-input", { type: "hidden" }),
      el("display-none", {}, false),
      el("skipped", { tabindex: "-1" }),
      keep,
    ]);
    expect(focusableIn(root).map((n) => (n as unknown as FakeFocusable).name)).toEqual([
      "keep",
    ]);
  });
});

describe("wrapTab", () => {
  const first = el("first");
  const middle = el("middle");
  const last = el("last");
  const root = dialogOf([first, middle, last]);

  test("Tab on the last element wraps to the first", () => {
    last.focus();
    const event = press();
    wrapTab(event as unknown as KeyboardEvent, root);
    expect(event.prevented).toBe(true);
    expect(nameOfActive()).toBe("first");
  });

  test("Shift+Tab on the first element wraps to the last", () => {
    first.focus();
    const event = press(true);
    wrapTab(event as unknown as KeyboardEvent, root);
    expect(event.prevented).toBe(true);
    expect(nameOfActive()).toBe("last");
  });

  test("Tab between inner elements is left to the browser", () => {
    middle.focus();
    const event = press();
    wrapTab(event as unknown as KeyboardEvent, root);
    expect(event.prevented).toBe(false);
    expect(nameOfActive()).toBe("middle");
  });

  test("Shift+Tab from the dialog itself goes to the last element", () => {
    root.focus();
    const event = press(true);
    wrapTab(event as unknown as KeyboardEvent, root);
    expect(event.prevented).toBe(true);
    expect(nameOfActive()).toBe("last");
  });

  test("focus behind the dialog is pulled back in", () => {
    el("page-behind").focus();
    const forward = press();
    wrapTab(forward as unknown as KeyboardEvent, root);
    expect(nameOfActive()).toBe("first");

    el("page-behind").focus();
    const backward = press(true);
    wrapTab(backward as unknown as KeyboardEvent, root);
    expect(nameOfActive()).toBe("last");
  });

  test("keys already handled, like Tab indenting a textarea, are ignored", () => {
    last.focus();
    const event = press(false, true);
    wrapTab(event as unknown as KeyboardEvent, root);
    expect(nameOfActive()).toBe("last");
  });

  test("a dialog with nothing focusable keeps focus on itself", () => {
    const empty = dialogOf([]);
    el("page-behind").focus();
    const event = press();
    wrapTab(event as unknown as KeyboardEvent, empty);
    expect(event.prevented).toBe(true);
    expect(doc.activeElement).toBe(empty);
  });
});
