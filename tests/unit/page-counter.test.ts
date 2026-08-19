import { describe, test, expect } from "bun:test";
import {
  agreedPageTotal,
  makePageCounter,
} from "../../src/server/search/page-counter";
import { declaredPages } from "../../src/client/utils/search-helpers";
import { MAX_PAGE } from "../../src/client/constants";

describe("search/makePageCounter", () => {
  test("stays unknown when an engine never reports", () => {
    expect(makePageCounter().total()).toBeUndefined();
  });

  test("keeps a declared total", () => {
    const counter = makePageCounter();
    counter.report({ total: 12 });
    expect(counter.total()).toBe(12);
  });

  test("keeps the last declaration when reported twice", () => {
    const counter = makePageCounter();
    counter.report({ total: 12 });
    counter.report({ total: 3 });
    expect(counter.total()).toBe(3);
  });

  test("ignores a missing total", () => {
    const counter = makePageCounter();
    counter.report({});
    expect(counter.total()).toBeUndefined();
  });

  test("ignores values that are not finite numbers", () => {
    const counter = makePageCounter();
    counter.report({ total: Number.NaN });
    counter.report({ total: Number.POSITIVE_INFINITY });
    expect(counter.total()).toBeUndefined();
  });

  test("floors fractional totals and never drops below one", () => {
    const fractional = makePageCounter();
    fractional.report({ total: 4.7 });
    expect(fractional.total()).toBe(4);

    const zero = makePageCounter();
    zero.report({ total: 0 });
    expect(zero.total()).toBe(1);

    const negative = makePageCounter();
    negative.report({ total: -5 });
    expect(negative.total()).toBe(1);
  });
});

describe("search/agreedPageTotal", () => {
  test("is unknown when no engine ran", () => {
    expect(agreedPageTotal([])).toBeUndefined();
  });

  test("uses the single declared total for a lone engine", () => {
    expect(agreedPageTotal([12])).toBe(12);
  });

  test("takes the highest total when every engine declared one", () => {
    expect(agreedPageTotal([3, 10, 7])).toBe(10);
  });

  test("stays unknown when any engine stayed silent", () => {
    expect(agreedPageTotal([3, undefined, 7])).toBeUndefined();
  });

  test("stays unknown when a lone engine stayed silent", () => {
    expect(agreedPageTotal([undefined])).toBeUndefined();
  });

  test("treats a non-paging engine as one page", () => {
    expect(agreedPageTotal([1, 1])).toBe(1);
  });
});

describe("client/declaredPages", () => {
  test("stays unknown when nothing was declared, so the ui shows next/prev", () => {
    expect(declaredPages(undefined)).toBeNull();
  });

  test("honors a declared total", () => {
    expect(declaredPages(3)).toBe(3);
  });

  test("honors a declared total larger than the old ceiling", () => {
    expect(declaredPages(42)).toBe(42);
    expect(declaredPages(42)).toBeGreaterThan(MAX_PAGE);
  });

  test("stays unknown when a total is not a usable page count", () => {
    expect(declaredPages(0)).toBeNull();
  });
});
