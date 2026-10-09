const COMMENT_PREFIXES = ["!", "#"];

const _countEntries = (raw: string): number =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !COMMENT_PREFIXES.some((prefix) => line.startsWith(prefix))).length;

export function bindEntryCount(fieldId: string, countId: string, label: (count: string) => string): void {
  const field = document.getElementById(fieldId);
  const count = document.getElementById(countId);
  if (!(field instanceof HTMLTextAreaElement) || !count || field.readOnly) return;
  const update = (): void => {
    const n = _countEntries(field.value);
    count.textContent = n ? label(n.toLocaleString()) : "";
  };
  field.addEventListener("input", update);
  update();
}
