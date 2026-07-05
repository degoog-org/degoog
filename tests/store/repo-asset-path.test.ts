import { describe, test, expect } from "bun:test";
import {
  resolveRepoAssetPath,
  resolveScreenshotPath,
} from "../../src/server/extensions/store";

describe("store/resolveRepoAssetPath containment", () => {
  test("rejects a repoSlug that tries to escape the store dir", () => {
    expect(
      resolveRepoAssetPath("../../../etc", "ssl/certs/ca.svg"),
    ).toBeNull();
  });

  test("rejects a repoSlug with a slash", () => {
    expect(resolveRepoAssetPath("foo/bar", "logo.png")).toBeNull();
  });

  test("rejects traversal inside the relative path", () => {
    expect(
      resolveRepoAssetPath("author-repo", "../../secret.png"),
    ).toBeNull();
  });

  test("rejects a non-image extension", () => {
    expect(resolveRepoAssetPath("author-repo", "config.json")).toBeNull();
  });

  test("resolves a normal asset within a valid repo slug", () => {
    const resolved = resolveRepoAssetPath("author-repo", "logo.png");
    expect(resolved).not.toBeNull();
    expect(resolved as string).toContain("author-repo");
    expect(resolved as string).toContain("logo.png");
  });
});

describe("store/resolveScreenshotPath containment", () => {
  test("rejects a repoSlug that tries to escape the store dir", () => {
    expect(
      resolveScreenshotPath("../../../etc", "themes/x", "ca.svg"),
    ).toBeNull();
  });
});
