import { describe, expect, test } from "bun:test";
import {
  cropPixels,
  drawRect,
  FULL_CROP,
  isCropRect,
  isFullCrop,
  moveRect,
  resizeRect,
  type CropRect,
} from "../../../src/client/modules/search-image/crop/crop-geometry";

const NONE = { left: false, right: false, top: false, bottom: false };

const expectRect = (actual: CropRect, expected: CropRect): void => {
  for (const key of ["x", "y", "w", "h"] as const) expect(actual[key]).toBeCloseTo(expected[key]);
};

describe("crop geometry", () => {
  test("moving keeps the box inside the image", () => {
    const rect = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    expectRect(moveRect(rect, 0.1, -0.1), { x: 0.3, y: 0.1, w: 0.5, h: 0.5 });
    expect(moveRect(rect, 1, 1)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(moveRect(rect, -1, -1)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
  });

  test("resizing moves only the grabbed edges and stops at the minimum size", () => {
    const shrunk = resizeRect(FULL_CROP, { ...NONE, left: true, top: true }, 0.4, 0.3, 0.1, 0.1);
    expectRect(shrunk, { x: 0.4, y: 0.3, w: 0.6, h: 0.7 });
    const crushed = resizeRect(shrunk, { ...NONE, right: true }, -5, 0, 0.1, 0.1);
    expect(crushed.x).toBe(0.4);
    expect(crushed.w).toBeCloseTo(0.1);
    const grown = resizeRect(shrunk, { ...NONE, bottom: true }, 0, 5, 0.1, 0.1);
    expect(grown.y + grown.h).toBe(1);
  });

  test("drawing works in any direction and never goes below the minimum", () => {
    expectRect(drawRect(0.8, 0.9, 0.2, 0.1, 0.05, 0.05), { x: 0.2, y: 0.1, w: 0.6, h: 0.8 });
    const click = drawRect(0.99, 0.99, 0.99, 0.99, 0.1, 0.1);
    expect(click.w).toBe(0.1);
    expect(click.x + click.w).toBeLessThanOrEqual(1);
    expect(click.y + click.h).toBeLessThanOrEqual(1);
  });

  test("full crops are recognised with a little slack", () => {
    expect(isFullCrop(FULL_CROP)).toBe(true);
    expect(isFullCrop({ x: 0.001, y: 0, w: 0.999, h: 1 })).toBe(true);
    expect(isFullCrop({ x: 0.1, y: 0, w: 0.9, h: 1 })).toBe(false);
  });

  test("only well formed rectangles pass validation", () => {
    expect(isCropRect({ x: 0, y: 0, w: 0.5, h: 0.5 })).toBe(true);
    expect(isCropRect({ x: 0, y: 0, w: 0, h: 0.5 })).toBe(false);
    expect(isCropRect({ x: -1, y: 0, w: 0.5, h: 0.5 })).toBe(false);
    expect(isCropRect({ x: "0", y: 0, w: 0.5, h: 0.5 })).toBe(false);
    expect(isCropRect(null)).toBe(false);
  });

  test("pixels stay inside the source image", () => {
    expect(cropPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 }, 800, 600)).toEqual({
      sx: 200,
      sy: 300,
      sw: 400,
      sh: 300,
    });
    expect(cropPixels({ x: 0.999, y: 0.999, w: 0.001, h: 0.001 }, 10, 10)).toEqual({
      sx: 9,
      sy: 9,
      sw: 1,
      sh: 1,
    });
  });
});
