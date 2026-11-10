import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { FakeElement, FakeNode, FakeText } from "../../helpers/fake-dom";
import { installClientEnv } from "../../helpers/client-env";
import type { ExtensionMeta } from "../../../src/client/types/extension";

const FOCUS_TAGS = new Set(["button", "input", "select", "textarea", "summary"]);

class FocusElement extends FakeElement {
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  hidden = false;
  disabled = false;
  classList = {
    add: (...names: string[]): void => names.forEach((n) => this._classes.add(n)),
    remove: (...names: string[]): void => names.forEach((n) => this._classes.delete(n)),
    contains: (name: string): boolean => this._classes.has(name),
  };
  private _classes = new Set<string>();

  set textContent(value: string) {
    this.replaceChildren(new FakeText(value));
  }

  get isConnected(): boolean {
    return fakeDocument.body.contains(this);
  }

  contains(target: unknown): boolean {
    let node = target as FakeNode | null;
    while (node) {
      if (node === this) return true;
      node = node.parentNode;
    }
    return false;
  }

  focus(): void {
    fakeDocument.activeElement = this;
  }

  getClientRects(): { length: number } {
    const shown = (el: FakeNode | null): boolean =>
      !(el instanceof FocusElement) ||
      (el.style.display !== "none" && !el.hidden && shown(el.parentNode));
    return { length: shown(this) ? 1 : 0 };
  }

  matches(selector: string): boolean {
    return selector.split(",").some((part) => {
      const sel = part.trim();
      if (sel === "[href]" || sel === "[tabindex]") {
        return this.getAttribute(sel.slice(1, -1)) !== null;
      }
      return sel === this.tagName;
    });
  }

  querySelectorAll(selector: string): FocusElement[] {
    const out: FocusElement[] = [];
    const walk = (node: FakeNode): void => {
      for (const child of node.childNodes) {
        if (child instanceof FocusElement && child.matches(selector)) out.push(child);
        walk(child);
      }
    };
    if (selector.split(",").some((s) => FOCUS_TAGS.has(s.trim()))) walk(this);
    return out;
  }

  querySelector(): null {
    return null;
  }

  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }
}

const listeners: Array<(e: KeyboardEvent) => void> = [];
const fakeDocument = {
  activeElement: null as unknown,
  body: new FocusElement("body"),
  createElement: (tag: string): FakeElement => new FocusElement(tag),
  createElementNS: (ns: string, tag: string): FakeElement => new FocusElement(tag, ns),
  createTextNode: (value: string): FakeText => new FakeText(value),
  getElementById: (id: string): FocusElement | null => byId.get(id) ?? null,
  querySelector: (sel: string): FocusElement | null =>
    sel === ".ext-modal-footer" ? footer : null,
  querySelectorAll: (sel: string): FocusElement[] =>
    sel === ".ext-modal-overlay" ? [overlay] : [],
  addEventListener: (type: string, fn: (e: KeyboardEvent) => void): void => {
    if (type === "keydown") listeners.push(fn);
  },
  removeEventListener: (): void => {},
};

const byId = new Map<string, FocusElement>();
const make = (tag: string, id: string, parent: FocusElement): FocusElement => {
  const el = new FocusElement(tag);
  el.setAttribute("id", id);
  byId.set(id, el);
  parent.appendChild(el);
  return el;
};

const overlay = make("div", "ext-modal-overlay", fakeDocument.body);
overlay.style.display = "none";
const dialog = make("div", "ext-modal", overlay);
const header = new FocusElement("div");
dialog.appendChild(header);
make("h2", "ext-modal-title", header);
const closeBtn = make("button", "ext-modal-close", header);
make("div", "ext-modal-body", dialog);
const footer = new FocusElement("div");
dialog.appendChild(footer);
make("span", "ext-modal-status", footer);
const saveBtn = make("button", "ext-modal-save", footer);
const configureBtn = make("button", "configure-sports", fakeDocument.body);

const ext: ExtensionMeta = {
  id: "sports-slot",
  displayName: "Sports",
  description: "",
  type: "plugin",
  configurable: true,
  settings: {},
  settingsSchema: [
    { key: "apiKey", label: "API key", type: "text" },
    { key: "region", label: "Region", type: "text" },
  ],
};

const press = (key: string, shiftKey = false) => {
  const event = {
    key,
    shiftKey,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  for (const fn of listeners) fn(event as unknown as KeyboardEvent);
  return event;
};

const active = (): FocusElement => fakeDocument.activeElement as FocusElement;

let modal: typeof import("../../../src/client/modules/modals/settings-modal/modal");
let restoreEnv: () => void;
let savedDocument: unknown;

beforeAll(async () => {
  restoreEnv = installClientEnv();
  savedDocument = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = fakeDocument;
  modal = await import("../../../src/client/modules/modals/settings-modal/modal");
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = savedDocument;
  restoreEnv();
});

beforeEach(() => {
  configureBtn.focus();
});

describe("settings Configure modal focus", () => {
  test("opening moves focus to the first field", () => {
    modal.openModal(ext);
    expect(dialog.contains(active())).toBe(true);
    expect(active().tagName).toBe("input");
    modal.closeModal();
  });

  test("Tab from the last control wraps to the first, Shift+Tab wraps back", () => {
    modal.openModal(ext);
    saveBtn.focus();
    expect(press("Tab").defaultPrevented).toBe(true);
    expect(active()).toBe(closeBtn);

    expect(press("Tab", true).defaultPrevented).toBe(true);
    expect(active()).toBe(saveBtn);
    modal.closeModal();
  });

  test("Tab from the page behind lands inside the modal", () => {
    modal.openModal(ext);
    configureBtn.focus();
    press("Tab");
    expect(active()).toBe(closeBtn);
    modal.closeModal();
  });

  test("Escape returns focus to the Configure button", () => {
    modal.openModal(ext);
    saveBtn.focus();
    press("Escape");
    expect(overlay.style.display).toBe("none");
    expect(active()).toBe(configureBtn);
  });

  test("closing with the close button returns focus to the Configure button", () => {
    modal.openModal(ext);
    closeBtn.focus();
    closeBtn.dispatch("click");
    expect(active()).toBe(configureBtn);
  });

  test("a custom modal focuses the dialog until its content takes over", () => {
    modal.openCustomModal({ title: "Order" });
    expect(active()).toBe(dialog);
    modal.closeModal();
    expect(active()).toBe(configureBtn);
  });

  test("Tab is ignored once the modal is closed", () => {
    modal.openModal(ext);
    modal.closeModal();
    expect(press("Tab").defaultPrevented).toBe(false);
    expect(active()).toBe(configureBtn);
  });
});
