import {
  OVERSIZED_FIELDS_KEY,
  type OversizedFieldInfo,
} from "../../../shared/indexer";

export const OVERSIZED_CLASS = "degoog-field--oversized";

export const formatOversizedSize = (chars: number): string => {
  const mb = chars / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(chars / 1024))} KB`;
};

export const oversizedMap = (
  settings: Record<string, unknown>,
): Record<string, OversizedFieldInfo> =>
  (settings[OVERSIZED_FIELDS_KEY] as Record<string, OversizedFieldInfo> | undefined) ??
  {};

export const markOversized = (
  el: HTMLTextAreaElement,
  info: OversizedFieldInfo,
  describe: (vars: { lines: string; size: string }) => string,
): void => {
  el.value = "";
  el.readOnly = true;
  el.classList.add(OVERSIZED_CLASS);
  el.placeholder = describe({
    lines: info.lines.toLocaleString(),
    size: formatOversizedSize(info.chars),
  });
};
