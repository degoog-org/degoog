import { SocksClient, type SocksProxy } from "socks";
import tls from "node:tls";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import type { Socket } from "node:net";
import type { TransportFetchOptions as OutgoingFetchOptions } from "../extensions/transports/types";

const SOCKS_PREFIX_RE = /^socks[45h]*:\/\//i;
const MAX_REDIRECTS = 5;
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
  useTls: boolean,
  timeoutMs: number = SOCKS_TIMEOUT_MS,
): Promise<Socket> {
  const { socket } = await SocksClient.createConnection({
    proxy,
    command: "connect",
    destination: { host, port },
    timeout: timeoutMs,
  });
  if (!useTls) return socket;

  const tlsSock = tls.connect({ socket, servername: host });
  await new Promise<void>((resolve, reject) => {
    tlsSock.once("secureConnect", resolve);
    tlsSock.once("error", reject);
  });
  return tlsSock;
}

function buildHttpRequest(
  method: string,
  parsed: URL,
  headers: Record<string, string> | undefined,
  body: string | undefined,
): string {
  const path = parsed.pathname + parsed.search;
  const lines: string[] = [`${method} ${path || "/"} HTTP/1.1`];
  const merged: Record<string, string> = { ...headers };
  merged["Host"] = parsed.host;
  merged["Connection"] = "close";
  if (!merged["Accept-Encoding"])
    merged["Accept-Encoding"] = "gzip, deflate, br";
  if (body && !merged["Content-Length"])
    merged["Content-Length"] = String(Buffer.byteLength(body));

  for (const [k, v] of Object.entries(merged)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push("", "");
  return lines.join("\r\n");
}

function readAll(sock: Socket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    sock.on("data", (c: Buffer) => chunks.push(c));
    sock.on("end", () => resolve(Buffer.concat(chunks)));
    sock.on("error", reject);
  });
}

function splitHeaderBody(raw: Buffer): { head: string; body: Buffer } {
  const sep = raw.indexOf("\r\n\r\n");
  if (sep === -1)
    return { head: raw.toString("latin1"), body: Buffer.alloc(0) };
  return {
    head: raw.subarray(0, sep).toString("latin1"),
    body: raw.subarray(sep + 4),
  };
}

function parseStatusLine(head: string): { status: number; statusText: string } {
  const first = head.split("\r\n")[0];
  const match = first.match(/^HTTP\/[\d.]+ (\d{3})(?: (.*))?$/);
  return {
    status: match ? Number(match[1]) : 0,
    statusText: match?.[2]?.trim() ?? "",
  };
}

function parseHeaders(head: string): Headers {
  const headers = new Headers();
  for (const line of head.split("\r\n").slice(1)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return headers;
}

function decodeChunked(buf: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const lineEnd = buf.indexOf("\r\n", pos);
    if (lineEnd === -1) break;
    const size = parseInt(buf.subarray(pos, lineEnd).toString("ascii"), 16);
    if (size === 0) break;
    pos = lineEnd + 2;
    chunks.push(buf.subarray(pos, pos + size));
    pos += size + 2;
  }
  return Buffer.concat(chunks);
}

function decompress(body: Buffer, encoding: string | null): Buffer {
  if (!encoding) return body;
  const enc = encoding.toLowerCase();
  if (enc === "gzip" || enc === "x-gzip") return gunzipSync(body);
  if (enc === "deflate") return inflateSync(body);
  if (enc === "br") return brotliDecompressSync(body);
  return body;
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

async function rawHttpFetch(
  sock: Socket,
  method: string,
  parsed: URL,
  headers: Record<string, string> | undefined,
  body: string | undefined,
): Promise<{
  status: number;
  statusText: string;
  headers: Headers;
  body: Buffer;
}> {
  const reqStr = buildHttpRequest(method, parsed, headers, body);
  sock.write(reqStr);
  if (body) sock.write(body);

  const raw = await readAll(sock);
  const { head, body: rawBody } = splitHeaderBody(raw);
  const { status, statusText } = parseStatusLine(head);
  const resHeaders = parseHeaders(head);

  let finalBody = rawBody;
  if (resHeaders.get("transfer-encoding")?.includes("chunked")) {
    finalBody = decodeChunked(rawBody);
  }
  finalBody = decompress(finalBody, resHeaders.get("content-encoding"));

  return { status, statusText, headers: resHeaders, body: finalBody };
}

export async function fetchViaSocks(
  url: string,
  proxyUrl: string,
  options: OutgoingFetchOptions = {},
  timeoutMs?: number,
): Promise<Response> {
  const proxy = parseSocksUrl(proxyUrl);
  const followRedirects = (options.redirect ?? "follow") !== "manual";
  const method = options.method ?? "GET";

  const doRequest = async (
    targetUrl: string,
    redirectsLeft: number = MAX_REDIRECTS,
  ): Promise<Response> => {
    const parsed = new URL(targetUrl);
    const useTls = parsed.protocol === "https:";
    const port = Number(parsed.port) || (useTls ? 443 : 80);

    const sock = await openSocksSocket(proxy, parsed.hostname, port, useTls, timeoutMs);

    try {
      const res = await rawHttpFetch(
        sock,
        method,
        parsed,
        options.headers,
        options.body,
      );

      if (
        followRedirects &&
        isRedirect(res.status) &&
        res.headers.get("location") &&
        redirectsLeft > 0
      ) {
        const next = new URL(res.headers.get("location")!, targetUrl).href;
        return doRequest(next, redirectsLeft - 1);
      }

      return new Response(new Uint8Array(res.body), {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } finally {
      sock.destroy();
    }
  };

  return doRequest(url);
}
