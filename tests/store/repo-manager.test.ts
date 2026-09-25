import { describe, test, expect } from "bun:test";
import { slugFromUrl } from "../../src/server/extensions/store/repo-ops";

describe("store/repo-manager", () => {
  test("slugFromUrl returns an author-repo slug for an https URL", () => {
    expect(slugFromUrl("https://github.com/user/repo.git")).toBe(
      "user-repo",
    );
  });
});
