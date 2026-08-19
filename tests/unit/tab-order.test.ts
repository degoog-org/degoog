import { describe, test, expect } from "bun:test";
import { applyTabOrder } from "../../src/client/utils/tab-order";

describe("client/applyTabOrder", () => {
  test("keeps incoming order when nothing is saved", () => {
    expect(applyTabOrder(["web", "images", "other"], [])).toEqual([
      "web",
      "images",
      "other",
    ]);
  });

  test("follows the saved order", () => {
    expect(
      applyTabOrder(["web", "images", "videos"], ["videos", "web", "images"]),
    ).toEqual(["videos", "web", "images"]);
  });

  test("puts freshly installed types last instead of first", () => {
    expect(
      applyTabOrder(["web", "images", "other"], ["web", "images"]),
    ).toEqual(["web", "images", "other"]);
  });

  test("ignores saved keys that no longer exist", () => {
    expect(
      applyTabOrder(["web", "images"], ["gone", "images", "web"]),
    ).toEqual(["images", "web"]);
  });
});
