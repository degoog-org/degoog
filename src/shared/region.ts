export const REGION_PARAM = "region";

const REGION_PATTERN = /^[A-Z]{2}$/;

export const isRegion = (value: unknown): value is string =>
  typeof value === "string" && REGION_PATTERN.test(value);

export const normalizeRegion = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  const upper = raw.trim().toUpperCase();
  return isRegion(upper) ? upper : "";
};
