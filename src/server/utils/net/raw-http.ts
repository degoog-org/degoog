import type { Socket } from "node:net";
import tls from "node:tls";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import type { TransportFetchOptions } from "../../types/extension";

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

type OpenSocket = (host: string, port: number) => Promise<Socket>;

async function _upgradeTls(sock: Socket, host: string, useTls: boolean): Promise<Socket> {
  if (!useTls) return sock;
  const tlsSock = tls.connect({ socket: sock, servername: host });
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

const _abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");

const _readAll = (sock: Socket, signal?: AbortSignal): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const fail = (err: Error): void => {
      signal?.removeEventListener("abort", onAbort);
      sock.destroy();
      reject(err);
    };
    const onAbort = (): void => fail(_abortError(signal!));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    sock.on("data", (c: Buffer) => {
      total += c.byteLength;
      if (total > MAX_RESPONSE_BYTES) return fail(new Error("Response too large"));
      chunks.push(c);
    });
    sock.on("end", () => {
      signal?.removeEventListener("abort", onAbort);
      resolve(Buffer.concat(chunks));
    });
    sock.on("error", fail);
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

function _parseStatusLine(head: string): { status: number; statusText: string } {
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
  const limits = { maxOutputLength: MAX_RESPONSE_BYTES };
  if (enc === "gzip" || enc === "x-gzip") return gunzipSync(body, limits);
  if (enc === "deflate") return inflateSync(body, limits);
  if (enc === "br") return brotliDecompressSync(body, limits);
  return body;
}

export async function fetchOverSocket(
  url: string,
  options: TransportFetchOptions,
  open: OpenSocket,
): Promise<Response> {
  const followRedirects = (options.redirect ?? "follow") !== "manual";
  const method = options.method ?? "GET";

  const doRequest = async (
    targetUrl: string,
    redirectsLeft: number = MAX_REDIRECTS,
  ): Promise<Response> => {
    const parsed = new URL(targetUrl);
    const useTls = parsed.protocol === "https:";
    const port = Number(parsed.port) || (useTls ? 443 : 80);

    const sock = await _upgradeTls(await open(parsed.hostname, port), parsed.hostname, useTls);

    try {
      sock.write(_buildHttpRequest(method, parsed, options.headers, options.body));
      if (options.body) sock.write(options.body);

      const raw = await _readAll(sock, options.signal);
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
