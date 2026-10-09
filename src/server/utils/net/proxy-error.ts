const PROXY_CONNECT_ERROR = "ProxyConnectError";

export class ProxyConnectError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = PROXY_CONNECT_ERROR;
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
  }
}

export const isProxyConnectError = (err: unknown): boolean =>
  err instanceof ProxyConnectError ||
  (typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === PROXY_CONNECT_ERROR);

const _message = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export const asProxyConnectError = (err: unknown, what: string): ProxyConnectError =>
  isProxyConnectError(err)
    ? (err as ProxyConnectError)
    : new ProxyConnectError(`${what}: ${_message(err)}`, err);
