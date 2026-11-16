export const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  label = "operation",
  signal?: AbortSignal,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const cutoff = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    onAbort = () => reject(new Error(`${label} aborted`));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([promise, cutoff]).finally(() => {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  });
};

const _envInt = (name: string, fallback: number): number => {
  const raw = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

export const SLOT_PLUGIN_TIMEOUT_MS = _envInt("DEGOOG_SLOT_TIMEOUT_MS", 10_000);
export const AUTOCOMPLETE_TIMEOUT_MS = _envInt(
  "DEGOOG_AUTOCOMPLETE_TIMEOUT_MS",
  8_000,
);
export const FAVICON_PROVIDER_TIMEOUT_MS = _envInt(
  "DEGOOG_FAVICON_PROVIDER_TIMEOUT_MS",
  5_000,
);
