import { describe, test, expect } from "bun:test";
import { popNamesToClose } from "../../src/client/utils/overlay-history";

describe("overlay history pop resolution", () => {
  test("closes only the top overlay when back returns to the layer below", () => {
    const { toClose, nextStack } = popNamesToClose(
      ["media-preview", "lightbox"],
      "media-preview",
    );

    expect(toClose).toEqual(["lightbox"]);
    expect(nextStack).toEqual(["media-preview"]);
  });

  test("closes every overlay above the landed real page entry", () => {
    const { toClose, nextStack } = popNamesToClose(
      ["media-preview", "lightbox"],
      null,
    );

    expect(toClose).toEqual(["lightbox", "media-preview"]);
    expect(nextStack).toEqual([]);
  });

  test("closes nothing when the popped state already matches the top overlay", () => {
    const { toClose, nextStack } = popNamesToClose(["media-preview"], "media-preview");

    expect(toClose).toEqual([]);
    expect(nextStack).toEqual(["media-preview"]);
  });

  test("leaves an empty stack untouched", () => {
    const { toClose, nextStack } = popNamesToClose([], null);

    expect(toClose).toEqual([]);
    expect(nextStack).toEqual([]);
  });
});

describe("overlay history navigation", () => {
  const OVERLAY_KEY = "degoogOverlay";
  const SEARCH_STATE = { degoog: true, query: "cats" };

  const stubHistory = () => {
    const entries: unknown[] = [SEARCH_STATE];
    const nav: number[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    g.location = { href: "https://x.test/search?q=cats" };
    g.history = {
      get state() {
        return entries[entries.length - 1];
      },
      pushState: (s: unknown) => {
        entries.push(s);
      },
      go: (n: number) => {
        nav.push(n);
        entries.splice(entries.length + n);
      },
    };
    return { entries, nav };
  };

  const pop = (state: unknown): PopStateEvent =>
    ({ state }) as PopStateEvent;

  test("a pop caused by closing an overlay is consumed, not re-searched", async () => {
    const { nav } = stubHistory();
    const mod = await import(
      `../../src/client/utils/overlay-history?nav=${Date.now()}`
    );

    let closed = false;
    mod.openOverlay("media-preview", () => {
      closed = true;
    });
    mod.closeOverlay("media-preview");

    expect(nav).toEqual([-1]);
    expect(closed).toBe(false);
    expect(mod.onOverlayPop(pop(SEARCH_STATE))).toBe(true);
  });

  test("a genuine back with no overlays open falls through to search restore", async () => {
    stubHistory();
    const mod = await import(
      `../../src/client/utils/overlay-history?fall=${Date.now()}`
    );

    expect(mod.onOverlayPop(pop(SEARCH_STATE))).toBe(false);
  });

  test("back from the lightbox closes only the lightbox", async () => {
    stubHistory();
    const mod = await import(
      `../../src/client/utils/overlay-history?nest=${Date.now()}`
    );

    const shut: string[] = [];
    mod.openOverlay("media-preview", () => shut.push("media-preview"));
    mod.openOverlay("lightbox", () => shut.push("lightbox"));

    const consumed = mod.onOverlayPop(pop({ [OVERLAY_KEY]: "media-preview" }));

    expect(consumed).toBe(true);
    expect(shut).toEqual(["lightbox"]);
  });

  test("closing the preview also shuts the lightbox stacked above it", async () => {
    const { nav } = stubHistory();
    const mod = await import(
      `../../src/client/utils/overlay-history?both=${Date.now()}`
    );

    const shut: string[] = [];
    mod.openOverlay("media-preview", () => shut.push("media-preview"));
    mod.openOverlay("lightbox", () => shut.push("lightbox"));
    mod.closeOverlay("media-preview");

    expect(shut).toEqual(["lightbox"]);
    expect(nav).toEqual([-2]);
  });
});
