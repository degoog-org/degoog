export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropEdges {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

export const FULL_CROP: CropRect = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

export const STARTING_CROP: CropRect = Object.freeze({ x: 0.08, y: 0.08, w: 0.84, h: 0.84 });

const EPSILON = 0.002;

const _clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const isFullCrop = (rect: CropRect): boolean =>
  rect.x <= EPSILON && rect.y <= EPSILON && rect.w >= 1 - EPSILON && rect.h >= 1 - EPSILON;

export const isCropRect = (value: unknown): value is CropRect => {
  if (!value || typeof value !== "object") return false;
  const { x, y, w, h } = value as Partial<CropRect>;
  return [x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) &&
    (w as number) > 0 && (h as number) > 0;
};

export const moveRect = (rect: CropRect, dx: number, dy: number): CropRect => ({
  ...rect,
  x: _clamp(rect.x + dx, 0, 1 - rect.w),
  y: _clamp(rect.y + dy, 0, 1 - rect.h),
});

export const resizeRect = (
  rect: CropRect,
  edges: CropEdges,
  dx: number,
  dy: number,
  minW: number,
  minH: number,
): CropRect => {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;
  if (edges.left) left = _clamp(left + dx, 0, right - minW);
  if (edges.right) right = _clamp(right + dx, left + minW, 1);
  if (edges.top) top = _clamp(top + dy, 0, bottom - minH);
  if (edges.bottom) bottom = _clamp(bottom + dy, top + minH, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
};

export const drawRect = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  minW: number,
  minH: number,
): CropRect => {
  const ax = _clamp(fromX, 0, 1);
  const ay = _clamp(fromY, 0, 1);
  const bx = _clamp(toX, 0, 1);
  const by = _clamp(toY, 0, 1);
  const w = Math.max(minW, Math.abs(bx - ax));
  const h = Math.max(minH, Math.abs(by - ay));
  const x = _clamp(bx < ax ? ax - w : ax, 0, 1 - w);
  const y = _clamp(by < ay ? ay - h : ay, 0, 1 - h);
  return { x, y, w, h };
};

export const cropPixels = (
  rect: CropRect,
  width: number,
  height: number,
): { sx: number; sy: number; sw: number; sh: number } => {
  const sx = Math.min(width - 1, Math.round(rect.x * width));
  const sy = Math.min(height - 1, Math.round(rect.y * height));
  return {
    sx,
    sy,
    sw: Math.max(1, Math.min(width - sx, Math.round(rect.w * width))),
    sh: Math.max(1, Math.min(height - sy, Math.round(rect.h * height))),
  };
};
