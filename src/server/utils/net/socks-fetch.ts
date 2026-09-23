import { SocksClient, type SocksProxy } from "socks";
import type { Socket } from "node:net";
import type { TransportFetchOptions } from "../../types/extension";
import { fetchOverSocket } from "./raw-http";

const SOCKS_PREFIX_RE = /^socks[45h]*:\/\//i;
const SOCKS_TIMEOUT_MS = 8_000;

export function isSocksProxy(proxyUrl: string): boolean {
  return SOCKS_PREFIX_RE.test(proxyUrl);
}

function parseSocksUrl(proxyUrl: string): SocksProxy {
  const url = new URL(proxyUrl);
  const proto = url.protocol.replace(":", "").toLowerCase();
  let type: 4 | 5 = 5;
  if (proto === "socks4" || proto === "socks4a") type = 4;

  const proxy: SocksProxy = {
    host: url.hostname,
    port: Number(url.port) || 1080,
    type,
  };
  if (url.username) proxy.userId = decodeURIComponent(url.username);
  if (url.password) proxy.password = decodeURIComponent(url.password);
  return proxy;
}

async function openSocksSocket(
  proxy: SocksProxy,
  host: string,
  port: number,
  timeoutMs: number = SOCKS_TIMEOUT_MS,
): Promise<Socket> {
  const { socket } = await SocksClient.createConnection({
    proxy,
    command: "connect",
    destination: { host, port },
    timeout: timeoutMs,
  });
  return socket;
}

export async function fetchViaSocks(
  url: string,
  proxyUrl: string,
  options: TransportFetchOptions = {},
  timeoutMs?: number,
): Promise<Response> {
  const proxy = parseSocksUrl(proxyUrl);
  return fetchOverSocket(url, options, (host, port) =>
    openSocksSocket(proxy, host, port, timeoutMs),
  );
}
