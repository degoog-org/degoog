import { describe, test, expect } from "bun:test";
import {
  getRepoSlugFromUrl,
  getStoreDirPath,
} from "../../src/server/extensions/store";

describe("store/repo-manager", () => {
  test("getRepoSlugFromUrl returns slug format for https URL", () => {
    const slug = getRepoSlugFromUrl("https://github.com/user/repo.git");
    expect(typeof slug).toBe("string");
    expect(slug.length).toBeGreaterThan(0);
    expect(slug).toMatch(/^[a-f0-9]{8}-[a-zA-Z0-9-]+$/);
  });

  test("getRepoSlugFromUrl is deterministic for same URL", () => {
    const url = "https://github.com/foo/bar.git";
    expect(getRepoSlugFromUrl(url)).toBe(getRepoSlugFromUrl(url));
  });

  test("getStoreDirPath returns non-empty string", () => {
    const path = getStoreDirPath();
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
  });
});
