export const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  label = "operation",
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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
