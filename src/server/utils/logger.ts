const enabled = process.env.LOGGER === "debug";

const _pending = new Map<
  string,
  { count: number; timer: ReturnType<typeof setTimeout> }
>();

function _flush(line: string): void {
  const entry = _pending.get(line);
  if (!entry) return;
  _pending.delete(line);
  console.error(entry.count > 0 ? `${line} (x${entry.count + 1})` : line);
}

export function debug(context: string, message: string, error?: unknown): void {
  if (!enabled) return;
  const errMsg =
    error instanceof Error ? error.message : error ? String(error) : "";
  const line = `[degoog:${context}] ${message}${errMsg ? ` — ${errMsg}` : ""}`;

  const existing = _pending.get(line);
  if (existing) {
    existing.count++;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => _flush(line), 50);
    return;
  }

  _pending.set(line, { count: 0, timer: setTimeout(() => _flush(line), 50) });
}
