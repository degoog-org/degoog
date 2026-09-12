import { describe, expect, test } from "bun:test";
import { staysHere } from "../../src/client/utils/plain-click";

type ClickShape = {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
};

const clickOf = (shape: ClickShape = {}): MouseEvent =>
  ({
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    button: 0,
    ...shape,
  }) as MouseEvent;

const anchorOf = (target = "", download = false): HTMLAnchorElement =>
  ({
    target,
    hasAttribute: (name: string) => name === "download" && download,
  }) as unknown as HTMLAnchorElement;

describe("staysHere", () => {
  test("accepts a plain left click on a same-tab anchor", () => {
    expect(staysHere(clickOf(), anchorOf())).toBe(true);
  });

  test("rejects alt clicks because they download instead of navigating", () => {
    expect(staysHere(clickOf({ altKey: true }), anchorOf())).toBe(false);
  });

  test("rejects the other modified clicks", () => {
    expect(staysHere(clickOf({ metaKey: true }), anchorOf())).toBe(false);
    expect(staysHere(clickOf({ ctrlKey: true }), anchorOf())).toBe(false);
    expect(staysHere(clickOf({ shiftKey: true }), anchorOf())).toBe(false);
    expect(staysHere(clickOf({ button: 1 }), anchorOf())).toBe(false);
  });

  test("rejects downloads and new-tab targets", () => {
    expect(staysHere(clickOf(), anchorOf("", true))).toBe(false);
    expect(staysHere(clickOf(), anchorOf("_blank"))).toBe(false);
  });
});
