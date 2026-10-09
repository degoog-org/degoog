import { ProxyConnectError } from "../../../utils/net/proxy-error";

const PROXY_EXIT_CODES = new Set([5, 7, 97]);

export const curlFailure = (exitCode: number, message: string, proxied: boolean): Error =>
  proxied && PROXY_EXIT_CODES.has(exitCode)
    ? new ProxyConnectError(message)
    : new Error(message);
