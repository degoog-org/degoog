import { describe, test, expect } from "bun:test";
import { join, sep } from "path";
import { resolveChild, resolveContained } from "../../src/server/utils/paths";

describe("resolveContained", () => {
  test("accepts a valid nested item path", () => {
    const root = join(sep, "store", "repo");
    const result = resolveContained(root, "engines", "google");
    expect(result).toBe(join(root, "engines", "google"));
  });

  test("rejects a relative escape via ..", () => {
    const root = join(sep, "store", "repo");
    const result = resolveContained(root, "..", "..", "etc", "passwd");
    expect(result).toBeNull();
  });

  test("rejects an absolute path outside the repo base", () => {
    const root = join(sep, "store", "repo");
    const outside = join(sep, "etc", "passwd");
    const result = resolveContained(root, outside);
    expect(result).toBeNull();
  });

  test("accepts the root itself", () => {
    const root = join(sep, "store", "repo");
    const result = resolveContained(root, "");
    expect(result).toBe(root);
  });
});

describe("resolveChild", () => {
  test("accepts a valid nested item path", () => {
    const root = join(sep, "store", "repo");
    const result = resolveChild(root, "engines", "google");
    expect(result).toBe(join(root, "engines", "google"));
  });

  test("rejects a relative escape via ..", () => {
    const root = join(sep, "store", "repo");
    expect(resolveChild(root, "..", "..", "etc", "passwd")).toBeNull();
  });

  test("rejects the root itself", () => {
    const root = join(sep, "store", "repo");
    expect(resolveChild(root, "")).toBeNull();
    expect(resolveChild(root, ".")).toBeNull();
  });
});
