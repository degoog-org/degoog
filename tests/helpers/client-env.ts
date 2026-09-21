interface ClientEnvOptions {
  /** Translator stub. Defaults to echoing the key back. */
  t?: (key: string, ...vars: string[]) => string;
}

/**
 * Installs the browser globals that client modules read at import time
 * (window.scopedT, window.t). Returns a restore function.
 */
export const installClientEnv = (options: ClientEnvOptions = {}): (() => void) => {
  const translate = options.t ?? ((key: string): string => key);
  const globals = globalThis as {
    window?: unknown;
    document?: unknown;
  };
  const savedWindow = globals.window;

  const fakeWindow = {
    scopedT: () => translate,
    t: translate,
    __DEGOOG_BASE_URL__: "",
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    dispatchEvent: (): boolean => true,
  };

  globals.window = fakeWindow;

  return (): void => {
    globals.window = savedWindow;
  };
};
