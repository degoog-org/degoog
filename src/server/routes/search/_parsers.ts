import { getEngineRegistry } from "../../extensions/engines/registry";
import type { EngineConfig, ImageFilter, ImgColor, ImgLayout, ImgNsfw, ImgSize, ImgType } from "../../types";

export function parsePage(raw: unknown): number {
  return Math.max(1, Math.min(10, Math.floor(Number(raw)) || 1));
}

export function parseEnginesFromBody(enabledList?: string[]): EngineConfig {
  const registry = getEngineRegistry();
  const enabledSet = enabledList ? new Set(enabledList) : null;
  const engines: EngineConfig = {};
  for (const { id } of registry) {
    engines[id] = enabledSet ? enabledSet.has(id) : true;
  }
  return engines;
}

export function parseImageFilter(
  color?: string | null,
  size?: string | null,
  type?: string | null,
  layout?: string | null,
  nsfw?: string | null,
): ImageFilter | undefined {
  const f: ImageFilter = {};
  if (color && color !== "any") f.color = color as ImgColor;
  if (size && size !== "any") f.size = size as ImgSize;
  if (type && type !== "any") f.type = type as ImgType;
  if (layout && layout !== "any") f.layout = layout as ImgLayout;
  if (nsfw && nsfw !== "any") f.nsfw = nsfw as ImgNsfw;
  return Object.keys(f).length > 0 ? f : undefined;
}
