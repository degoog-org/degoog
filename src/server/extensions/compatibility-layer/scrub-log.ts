const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

export const scrubLog = (raw: string): string =>
  String(raw ?? "").replace(CONTROL_CHARS, "");
