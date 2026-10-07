export const ENGINE_INPUT = {
  TEXT: "text",
  IMAGE: "image",
} as const;

export type EngineInput = (typeof ENGINE_INPUT)[keyof typeof ENGINE_INPUT];

export const SEARCH_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const SEARCH_IMAGE_MAX_SIDE = 1024;
export const SEARCH_IMAGE_QUERY_MAX_CHARS = 200;

export const coerceEngineInput = (raw: unknown): EngineInput =>
  raw === ENGINE_INPUT.IMAGE ? ENGINE_INPUT.IMAGE : ENGINE_INPUT.TEXT;
