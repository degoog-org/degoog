import { describe, test, expect } from "bun:test";
import { hasMorePages } from "../../src/client/utils/page-flow";

describe("client/hasMorePages", () => {
  test("keeps probing while no engine declared a total", () => {
    expect(hasMorePages(1, null, false)).toBe(true);
    expect(hasMorePages(37, null, false)).toBe(true);
  });

  test("stops at a declared total", () => {
    expect(hasMorePages(2, 3, false)).toBe(true);
    expect(hasMorePages(3, 3, false)).toBe(false);
  });

  test("stops past a declared total", () => {
    expect(hasMorePages(4, 3, false)).toBe(false);
  });

  test("stops on a single declared page", () => {
    expect(hasMorePages(1, 1, false)).toBe(false);
  });

  test("stops once an empty page proved the end", () => {
    expect(hasMorePages(1, null, true)).toBe(false);
    expect(hasMorePages(2, 10, true)).toBe(false);
  });
});
