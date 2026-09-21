import { describe, test, expect } from "bun:test";
import {
  resolveRepoAssetPath,
  resolveScreenshotPath,
} from "../../src/server/extensions/store";

const REJECTED: [string, string, string][] = [
  ["a repoSlug that tries to escape the store dir", "../../../etc", "ssl/certs/ca.svg"],
  ["a repoSlug with a slash", "foo/bar", "logo.png"],
  ["traversal inside the relative path", "author-repo", "../../secret.png"],
  ["a non-image extension", "author-repo", "config.json"],
];

describe("store/resolveRepoAssetPath containment", () => {
  for (const [label, slug, rel] of REJECTED) {
    test(`rejects ${label}`, () => {
      expect(resolveRepoAssetPath(slug, rel)).toBeNull();
    });
  }

  test("resolves a normal asset within a valid repo slug", () => {
    const resolved = resolveRepoAssetPath("author-repo", "logo.png");
    expect(resolved).not.toBeNull();
    expect(resolved as string).toContain("author-repo");
    expect(resolved as string).toContain("logo.png");
  });
});

describe("store/resolveScreenshotPath containment", () => {
  test("rejects a repoSlug that tries to escape the store dir", () => {
    expect(resolveScreenshotPath("../../../etc", "themes/x", "ca.svg")).toBeNull();
  });
});
