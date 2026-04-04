import net from "node:net";
import tls from "node:tls";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import type { TransportFetchOptions as OutgoingFetchOptions } from "../extensions/transports/types";

const MAX_REDIRECTS = 5;
const CONNECT_TIMEOUT_MS = 8_000;

function parseProxyUrl(proxyUrl: string): { host: string; port: number } {
  const url = new URL(proxyUrl);
  return { host: url.hostname, port: Number(url.port) || 8080 };
}

const _openConnectTunnel = (
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  timeoutMs: number = CONNECT_TIMEOUT_MS,
): Promise<net.Socket> =>
  new Promise((resolve, reject) => {
    const sock = net.connect(proxyPort, proxyHost);
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error("CONNECT tunnel timeout"));
    }, timeoutMs);

    sock.once("connect", () => {
      sock.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`,
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

async function _openProxySocket(
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  useTls: boolean,
  timeoutMs?: number,
): Promise<net.Socket> {
  const sock = await _openConnectTunnel(
    proxyHost,
    proxyPort,
    targetHost,
    targetPort,
    timeoutMs,
  );
  if (!useTls) return sock;

  const tlsSock = tls.connect({ socket: sock, servername: targetHost });
  await new Promise<void>((resolve, reject) => {
    tlsSock.once("secureConnect", resolve);
    tlsSock.once("error", reject);
  });
  return tlsSock;
}

function _buildHttpRequest(
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

const _readAll = (sock: net.Socket): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    sock.on("data", (c: Buffer) => chunks.push(c));
    sock.on("end", () => resolve(Buffer.concat(chunks)));
    sock.on("error", reject);
  });

function _splitHeaderBody(raw: Buffer): { head: string; body: Buffer } {
  const sep = raw.indexOf("\r\n\r\n");
  if (sep === -1)
    return { head: raw.toString("latin1"), body: Buffer.alloc(0) };
  return {
    head: raw.subarray(0, sep).toString("latin1"),
    body: raw.subarray(sep + 4),
  };
}

function _parseStatusLine(head: string): {
  status: number;
  statusText: string;
} {
  const first = head.split("\r\n")[0];
  const match = first.match(/^HTTP\/[\d.]+ (\d{3})(?: (.*))?$/);
  return {
    status: match ? Number(match[1]) : 0,
    statusText: match?.[2]?.trim() ?? "",
  };
}

function _parseHeaders(head: string): Headers {
  const headers = new Headers();
  for (const line of head.split("\r\n").slice(1)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return headers;
}

function _decodeChunked(buf: Buffer): Buffer {
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

function _decompress(body: Buffer, encoding: string | null): Buffer {
  if (!encoding) return body;
  const enc = encoding.toLowerCase();
  if (enc === "gzip" || enc === "x-gzip") return gunzipSync(body);
  if (enc === "deflate") return inflateSync(body);
  if (enc === "br") return brotliDecompressSync(body);
  return body;
}

export async function fetchViaHttpProxy(
  url: string,
  proxyUrl: string,
  options: OutgoingFetchOptions = {},
  timeoutMs?: number,
): Promise<Response> {
  const { host: proxyHost, port: proxyPort } = parseProxyUrl(proxyUrl);
  const followRedirects = (options.redirect ?? "follow") !== "manual";
  const method = options.method ?? "GET";

  const doRequest = async (
    targetUrl: string,
    redirectsLeft: number = MAX_REDIRECTS,
  ): Promise<Response> => {
    const parsed = new URL(targetUrl);
    const useTls = parsed.protocol === "https:";
    const port = Number(parsed.port) || (useTls ? 443 : 80);

    const sock = await _openProxySocket(
      proxyHost,
      proxyPort,
      parsed.hostname,
      port,
      useTls,
      timeoutMs,
    );

    try {
      const reqStr = _buildHttpRequest(
        method,
        parsed,
        options.headers,
        options.body,
      );
      sock.write(reqStr);
      if (options.body) sock.write(options.body);

      const raw = await _readAll(sock);
      const { head, body: rawBody } = _splitHeaderBody(raw);
      const { status, statusText } = _parseStatusLine(head);
      const resHeaders = _parseHeaders(head);

      let finalBody = rawBody;
      if (resHeaders.get("transfer-encoding")?.includes("chunked")) {
        finalBody = _decodeChunked(rawBody);
      }
      finalBody = _decompress(finalBody, resHeaders.get("content-encoding"));

      if (
        followRedirects &&
        status >= 300 &&
        status < 400 &&
        resHeaders.get("location") &&
        redirectsLeft > 0
      ) {
        const next = new URL(resHeaders.get("location")!, targetUrl).href;
        return doRequest(next, redirectsLeft - 1);
      }

      return new Response(new Uint8Array(finalBody), {
        status,
        statusText,
        headers: resHeaders,
      });
    } finally {
      sock.destroy();
    }
  };

  return doRequest(url);
}
