import { describe, test, expect } from "bun:test";
import { getRepoSlugFromUrl } from "../../src/server/extensions/store";

describe("store/repo-manager", () => {
  test("getRepoSlugFromUrl returns an author-repo slug for an https URL", () => {
    expect(getRepoSlugFromUrl("https://github.com/user/repo.git")).toBe(
      "user-repo",
    );
  });
});
