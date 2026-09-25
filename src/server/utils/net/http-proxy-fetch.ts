import net from "node:net";
import type { TransportFetchOptions } from "../../types/extension";
import { fetchOverSocket } from "./raw-http";

const CONNECT_TIMEOUT_MS = 8_000;

function parseProxyUrl(proxyUrl: string): {
  host: string;
  port: number;
  auth: string | undefined;
} {
  const url = new URL(proxyUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const auth =
    username || password
      ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
      : undefined;

  return {
    host: url.hostname,
    port: Number(url.port) || (url.protocol === "http:" ? 80 : 443),
    auth,
  };
}

const _openConnectTunnel = (
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  proxyAuth: string | undefined,
  timeoutMs: number = CONNECT_TIMEOUT_MS,
): Promise<net.Socket> =>
  new Promise((resolve, reject) => {
    const sock = net.connect(proxyPort, proxyHost);
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error("CONNECT tunnel timeout"));
    }, timeoutMs);

    sock.once("connect", () => {
      const authHeader = proxyAuth ? `Proxy-Authorization: ${proxyAuth}\r\n` : "";
      sock.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${authHeader}\r\n`,
      );
    });

    let buf = "";
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString("latin1");
      const endOfHeaders = buf.indexOf("\r\n\r\n");
      if (endOfHeaders === -1) return;
      clearTimeout(timer);
      sock.removeListener("data", onData);
      const statusLine = buf.split("\r\n")[0];
      const statusMatch = statusLine.match(/^HTTP\/[\d.]+ (\d{3})/);
      const code = statusMatch ? Number(statusMatch[1]) : 0;
      if (code === 200) {
        resolve(sock);
      } else {
        sock.destroy();
        reject(new Error(`CONNECT tunnel failed with status ${code}`));
      }
    };

    sock.on("data", onData);
    sock.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

export async function fetchViaHttpProxy(
  url: string,
  proxyUrl: string,
  options: TransportFetchOptions = {},
  timeoutMs?: number,
): Promise<Response> {
  const { host: proxyHost, port: proxyPort, auth: proxyAuth } =
    parseProxyUrl(proxyUrl);
  return fetchOverSocket(url, options, (host, port) =>
    _openConnectTunnel(proxyHost, proxyPort, host, port, proxyAuth, timeoutMs),
  );
}
