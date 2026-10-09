import type { Socket } from "node:net";
import tls from "node:tls";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";
import type { TransportBody, TransportFetchOptions } from "../../types/extension";

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const IDLE_CONNECTION_MS = 60_000;
const HEADER_END = "\r\n\r\n";
const CHUNKED_TAIL = "0\r\n\r\n";
const TAIL_BYTES = 16;

type OpenSocket = (host: string, port: number) => Promise<Socket>;

interface Parked {
  sock: Socket;
  timer: ReturnType<typeof setTimeout>;
  drop: () => void;
}

const _parked = new Map<string, Parked[]>();

const _unpark = (key: string): Socket | null => {
  const list = _parked.get(key);
  while (list?.length) {
    const entry = list.pop()!;
    clearTimeout(entry.timer);
    entry.sock.removeListener("close", entry.drop);
    entry.sock.removeListener("error", entry.drop);
    entry.sock.removeListener("data", entry.drop);
    if (!entry.sock.destroyed && entry.sock.writable) {
      if (list.length === 0) _parked.delete(key);
      return entry.sock;
    }
  }
  _parked.delete(key);
  return null;
};

const _park = (key: string, sock: Socket): void => {
  const list = _parked.get(key) ?? [];
  const entry: Parked = {
    sock,
    timer: setTimeout(() => entry.drop(), IDLE_CONNECTION_MS),
    drop: () => {
      clearTimeout(entry.timer);
      const index = list.indexOf(entry);
      if (index >= 0) list.splice(index, 1);
      if (list.length === 0 && _parked.get(key) === list) _parked.delete(key);
      sock.destroy();
    },
  };
  entry.timer.unref?.();
  sock.once("close", entry.drop);
  sock.once("error", entry.drop);
  sock.once("data", entry.drop);
  list.push(entry);
  _parked.set(key, list);
};

export const closeIdleConnections = (): void => {
  for (const list of [..._parked.values()]) {
    for (const entry of [...list]) entry.drop();
  }
  _parked.clear();
};

function _buildHttpRequest(
  method: string,
  parsed: URL,
  headers: Record<string, string> | undefined,
  body: TransportBody | undefined,
  keepAlive: boolean,
): string {
  const path = parsed.pathname + parsed.search;
  const lines: string[] = [`${method} ${path || "/"} HTTP/1.1`];
  const merged: Record<string, string> = { ...headers };
  merged["Host"] = parsed.host;
  merged["Connection"] = keepAlive ? "keep-alive" : "close";
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

const _openAbortable = (
  open: OpenSocket,
  host: string,
  port: number,
  signal: AbortSignal | undefined,
): Promise<Socket> => {
  if (!signal) return open(host, port);
  if (signal.aborted) return Promise.reject(_abortError(signal));
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = (): void => {
      settled = true;
      reject(_abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    open(host, port).then(
      (sock) => {
        signal.removeEventListener("abort", onAbort);
        if (settled) {
          sock.destroy();
          return;
        }
        settled = true;
        resolve(sock);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        if (settled) return;
        settled = true;
        reject(err);
      },
    );
  });
};

const _handshake = (tlsSock: Socket, signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve, reject) => {
    const onAbort = (): void => reject(_abortError(signal!));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    tlsSock.once("secureConnect", () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    });
    tlsSock.once("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
  });

const _upgradeTls = async (
  sock: Socket,
  host: string,
  useTls: boolean,
  signal: AbortSignal | undefined,
): Promise<Socket> => {
  if (!useTls) return sock;
  const tlsSock = tls.connect({ socket: sock, servername: host });
  try {
    await _handshake(tlsSock, signal);
  } catch (err) {
    tlsSock.destroy();
    sock.destroy();
    throw err;
  }
  return tlsSock;
};

interface RawResponse {
  head: string;
  body: Buffer;
  reusable: boolean;
}

class ResponseError extends Error {
  readonly received: boolean;

  constructor(cause: Error, received: boolean) {
    super(cause.message);
    this.name = cause.name;
    this.received = received;
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

type Framing = { kind: "none" } | { kind: "length"; length: number } | { kind: "chunked" } | { kind: "close" };

const _framing = (head: string, bodiless: boolean): Framing => {
  const status = _parseStatusLine(head).status;
  if (bodiless || status === 204 || status === 304 || (status >= 100 && status < 200)) {
    return { kind: "none" };
  }
  const headers = _parseHeaders(head);
  if (headers.get("transfer-encoding")?.toLowerCase().includes("chunked")) return { kind: "chunked" };
  const length = Number(headers.get("content-length"));
  if (headers.has("content-length") && Number.isInteger(length) && length >= 0) {
    return { kind: "length", length };
  }
  return { kind: "close" };
};

const _keepsAlive = (head: string): boolean => {
  if (!/^HTTP\/1\.1 /.test(head)) return false;
  return !/^connection:[^\r\n]*\bclose\b/im.test(head);
};

const _chunkedComplete = (body: Buffer): boolean => {
  let pos = 0;
  while (pos < body.length) {
    const lineEnd = body.indexOf("\r\n", pos);
    if (lineEnd === -1) return false;
    const size = parseInt(body.subarray(pos, lineEnd).toString("ascii"), 16);
    if (!Number.isFinite(size)) return false;
    if (size === 0) return body.indexOf(HEADER_END, lineEnd) !== -1;
    pos = lineEnd + 2 + size + 2;
  }
  return false;
};

const _readResponse = (
  sock: Socket,
  bodiless: boolean,
  signal?: AbortSignal,
): Promise<RawResponse> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let head = "";
    let bodyStart = -1;
    let framing: Framing = { kind: "close" };
    let tail = Buffer.alloc(0);

    const cleanup = (): void => {
      sock.removeListener("data", onData);
      sock.removeListener("end", onEnd);
      sock.removeListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const all = (): Buffer => Buffer.concat(chunks, total);
    const finish = (body: Buffer, reusable: boolean): void => {
      cleanup();
      resolve({ head, body, reusable: reusable && _keepsAlive(head) });
    };
    const fail = (err: Error): void => {
      cleanup();
      sock.destroy();
      reject(new ResponseError(err, total > 0));
    };
    const settle = (): void => {
      if (bodyStart < 0) {
        const raw = all();
        const sep = raw.indexOf(HEADER_END);
        if (sep === -1) return;
        head = raw.subarray(0, sep).toString("latin1");
        bodyStart = sep + HEADER_END.length;
        framing = _framing(head, bodiless);
      }
      const bodyBytes = total - bodyStart;
      if (framing.kind === "none") return finish(Buffer.alloc(0), true);
      if (framing.kind === "length" && bodyBytes >= framing.length) {
        return finish(all().subarray(bodyStart, bodyStart + framing.length), true);
      }
      if (framing.kind === "chunked" && tail.includes(CHUNKED_TAIL)) {
        const body = all().subarray(bodyStart);
        if (_chunkedComplete(body)) return finish(body, true);
      }
    };
    const onData = (chunk: Buffer): void => {
      total += chunk.byteLength;
      if (total > MAX_RESPONSE_BYTES) return fail(new Error("Response too large"));
      chunks.push(chunk);
      tail = Buffer.concat([tail, chunk]).subarray(-TAIL_BYTES);
      settle();
    };
    const onEnd = (): void => {
      if (bodyStart < 0) {
        const raw = all();
        const sep = raw.indexOf(HEADER_END);
        head = (sep === -1 ? raw : raw.subarray(0, sep)).toString("latin1");
        return finish(sep === -1 ? Buffer.alloc(0) : raw.subarray(sep + HEADER_END.length), false);
      }
      finish(all().subarray(bodyStart), false);
    };
    const onError = (err: Error): void => fail(err);
    const onAbort = (): void => fail(_abortError(signal!));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    sock.on("data", onData);
    sock.once("end", onEnd);
    sock.once("error", onError);
  });

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
  reuseKey?: string,
): Promise<Response> {
  const followRedirects = (options.redirect ?? "follow") !== "manual";
  const method = options.method ?? "GET";

  const connect = async (parsed: URL, useTls: boolean, port: number): Promise<Socket> =>
    _upgradeTls(
      await _openAbortable(open, parsed.hostname, port, options.signal),
      parsed.hostname,
      useTls,
      options.signal,
    );

  const exchange = async (
    parsed: URL,
    useTls: boolean,
    port: number,
    poolKey: string,
  ): Promise<RawResponse> => {
    const idle = poolKey ? _unpark(poolKey) : null;
    const sock = idle ?? (await connect(parsed, useTls, port));
    try {
      sock.write(_buildHttpRequest(method, parsed, options.headers, options.body, Boolean(poolKey)));
      if (options.body) sock.write(options.body);
      const raw = await _readResponse(sock, method.toUpperCase() === "HEAD", options.signal);
      if (poolKey && raw.reusable) _park(poolKey, sock);
      else sock.destroy();
      return raw;
    } catch (err) {
      sock.destroy();
      const stale = idle && err instanceof ResponseError && !err.received && !options.signal?.aborted;
      if (stale) return exchange(parsed, useTls, port, poolKey);
      throw err instanceof ResponseError ? ((err as Error & { cause?: unknown }).cause ?? err) : err;
    }
  };

  const doRequest = async (
    targetUrl: string,
    redirectsLeft: number = MAX_REDIRECTS,
  ): Promise<Response> => {
    const parsed = new URL(targetUrl);
    const useTls = parsed.protocol === "https:";
    const port = Number(parsed.port) || (useTls ? 443 : 80);
    const poolKey = reuseKey ? `${reuseKey}|${parsed.protocol}//${parsed.hostname}:${port}` : "";

    const { head, body: rawBody } = await exchange(parsed, useTls, port, poolKey);
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
  };

  return doRequest(url);
}
