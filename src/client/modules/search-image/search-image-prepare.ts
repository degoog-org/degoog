import { SEARCH_IMAGE_MAX_SIDE } from "../../../shared/engine-input";
import { cropPixels, type CropRect } from "./crop/crop-geometry";

const JPEG_QUALITY = 0.9;

export const isImageFile = (file: File | null | undefined): file is File =>
  !!file && file.type.startsWith("image/");

export const firstImageFile = (files: Iterable<File | null> | ArrayLike<File | null>): File | null =>
  Array.from(files).find(isImageFile) ?? null;

const _jpeg = (
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): string => {
  const scale = Math.min(1, SEARCH_IMAGE_MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
};

export const toSearchDataUrl = async (source: Blob): Promise<string> => {
  const bitmap = await createImageBitmap(source);
  try {
    return _jpeg(bitmap, 0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
};

export const cropSearchDataUrl = async (dataUrl: string, rect: CropRect): Promise<string> => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const { sx, sy, sw, sh } = cropPixels(rect, img.naturalWidth, img.naturalHeight);
  return _jpeg(img, sx, sy, sw, sh);
};
