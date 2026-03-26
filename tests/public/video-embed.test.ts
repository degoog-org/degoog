import { describe, expect, test } from "bun:test";
import { getVideoEmbedUrl } from "../../src/client/utils/video-embed";

describe("public/video-embed", () => {
  test("returns a nocookie embed url for youtube watch links", () => {
    expect(
      getVideoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  test("supports youtu.be links and preserves timestamps", () => {
    expect(
      getVideoEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=1m30s"),
    ).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90");
  });

  test("supports embedded and shorts urls", () => {
    expect(
      getVideoEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ"),
    ).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(
      getVideoEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  test("supports youtube nocookie embeds and rejects unsupported urls", () => {
    expect(
      getVideoEmbedUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
    ).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(getVideoEmbedUrl("https://example.com/video")).toBeNull();
    expect(getVideoEmbedUrl("")).toBeNull();
  });
});
