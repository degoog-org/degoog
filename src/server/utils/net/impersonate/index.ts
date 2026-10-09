import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logger } from "../../logger";
import { ProxyConnectError } from "../proxy-error";
import type { WorkerFetch, WorkerReply } from "./protocol";

const NS = "impersonate";
const LIB_ENV = "DEGOOG_CURL_IMPERSONATE_LIB";
const LIB_NAMES = ["libcurl-impersonate.so", "libcurl-impersonate.dylib"];
const LIB_DIRS = ["/usr/local/lib", "/usr/lib", "/opt/homebrew/lib", join(homedir(), ".local", "lib")];
const DEFAULT_TARGET = "firefox135";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const PROXY_EXIT_CODES = new Set([5, 7, 97]);
const TIMEOUT_EXIT_CODE = 28;
const DECODED_HEADERS = ["content-encoding", "content-length", "transfer-encoding"];
const BODILESS = new Set([204, 205, 304]);
const DECODABLE_ENCODINGS = new Set(["gzip", "deflate", "br", "zstd", "identity"]);
const FIREFOX_ACCEPT_ENCODING = "gzip, deflate, br, zstd";
const BAD_GATEWAY = 502;

export interface ImpersonateRequest {
  url: string;
  method?: string;
  headers?: Record<string, string> | [string, string][];
  body?: string | Uint8Array;
  proxyUrl?: string;
  egressKey: string;
  followRedirects?: boolean;
  timeoutMs?: number;
  target?: string;
  defaultHeaders?: boolean;
  acceptEncoding?: string;
  cookieJar?: string;
  signal?: AbortSignal;
}

export interface ImpersonateResult {
  response: Response;
  cookieJar?: string;
}

export type ImpersonateFetch = (request: ImpersonateRequest) => Promise<ImpersonateResult>;

interface Pending {
  resolve: (reply: WorkerReply) => void;
}

let worker: Worker | null = null;
let ready: Promise<boolean> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

export const findImpersonateLibrary = (): string | null => {
  const configured = process.env[LIB_ENV]?.trim();
  if (configured) return existsSync(configured) ? configured : null;
  for (const dir of LIB_DIRS) {
    for (const name of LIB_NAMES) {
      const path = join(dir, name);
      if (existsSync(path)) return path;
    }
  }
  return null;
};

const _boot = (): Promise<boolean> => {
  const libPath = findImpersonateLibrary();
  if (!libPath) {
    logger.debug(NS, "libcurl-impersonate not found, curl-impersonate keeps using the binaries");
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const spawned = new Worker(new URL("./worker.ts", import.meta.url).href);
    (spawned as Worker & { unref(): void }).unref();
    spawned.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.type === "ready") {
        worker = spawned;
        logger.info(NS, `using ${libPath} with connection reuse per proxy`);
        return resolve(true);
      }
      if (reply.type === "unavailable") {
        logger.warn(NS, `could not load ${libPath}, curl-impersonate keeps using the binaries: ${reply.message}`);
        spawned.terminate();
        return resolve(false);
      }
      if ("id" in reply) {
        const entry = pending.get(reply.id);
        if (!entry) return;
        pending.delete(reply.id);
        entry.resolve(reply);
      }
    };
    spawned.onerror = (event) => {
      logger.warn(NS, "impersonation worker crashed", event);
      worker = null;
      ready = null;
      for (const [id, entry] of pending) {
        pending.delete(id);
        entry.resolve({ type: "failed", id, code: -1, message: "impersonation worker crashed" });
      }
      resolve(false);
    };
    spawned.postMessage({ type: "init", libPath });
  });
};

export const impersonateAvailable = (): Promise<boolean> => {
  ready ??= _boot();
  return ready;
};

const _decodable = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const kept = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => DECODABLE_ENCODINGS.has(part.split(";")[0].trim().toLowerCase()));
  return kept.length ? kept.join(", ") : undefined;
};

const _headerPairs = (headers: ImpersonateRequest["headers"]): [string, string][] =>
  Array.isArray(headers) ? headers : Object.entries(headers ?? {});

const _parseHead = (head: string): { statusText: string; headers: Headers } => {
  const lines = head.split("\r\n").filter(Boolean);
  const statusText = lines[0]?.replace(/^HTTP\/\S+\s+\d{3}\s*/, "") ?? "";
  const headers = new Headers();
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim();
    if (DECODED_HEADERS.includes(name.toLowerCase())) continue;
    headers.append(name, line.slice(idx + 1).trim());
  }
  return { statusText, headers };
};

const _failure = (reply: { code: number; message: string }, proxied: boolean): Error => {
  if (proxied && PROXY_EXIT_CODES.has(reply.code)) return new ProxyConnectError(reply.message);
  const err = new Error(reply.message);
  if (reply.code === TIMEOUT_EXIT_CODE) err.name = "TimeoutError";
  return err;
};

const _abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");

export const impersonateFetch: ImpersonateFetch = async (request) => {
  if (!(await impersonateAvailable()) || !worker) {
    throw new Error("libcurl-impersonate is not available");
  }
  const { signal } = request;
  signal?.throwIfAborted();
  const id = nextId++;
  const body =
    typeof request.body === "string" ? new TextEncoder().encode(request.body) : request.body;
  const message: WorkerFetch = {
    type: "fetch",
    id,
    url: request.url,
    method: request.method ?? "GET",
    headers: _headerPairs(request.headers),
    body,
    proxyUrl: request.proxyUrl,
    egressKey: request.egressKey,
    followRedirects: request.followRedirects ?? true,
    timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    target: request.target ?? DEFAULT_TARGET,
    defaultHeaders: request.defaultHeaders ?? true,
    acceptEncoding: _decodable(request.acceptEncoding) ?? FIREFOX_ACCEPT_ENCODING,
    cookieJar: request.cookieJar,
    maxBytes: MAX_RESPONSE_BYTES,
  };
  const live = worker;
  const reply = await new Promise<WorkerReply>((resolve, reject) => {
    const onAbort = (): void => {
      pending.delete(id);
      live.postMessage({ type: "cancel", id });
      reject(_abortError(signal!));
    };
    pending.set(id, {
      resolve: (value) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    live.postMessage(message);
  });
  if (reply.type === "failed") throw _failure(reply, Boolean(request.proxyUrl));
  if (reply.type !== "done") throw new Error("impersonated request was cancelled");
  const { statusText, headers } = _parseHead(reply.head);
  const status = reply.status >= 200 && reply.status <= 599 ? reply.status : BAD_GATEWAY;
  const response = new Response(BODILESS.has(status) ? null : reply.body, {
    status,
    statusText,
    headers,
  });
  if (reply.effectiveUrl) Object.defineProperty(response, "url", { value: reply.effectiveUrl });
  return { response, cookieJar: reply.cookieJar };
};
