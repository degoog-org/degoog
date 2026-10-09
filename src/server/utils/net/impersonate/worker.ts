import { cc, CString, toArrayBuffer, type Pointer } from "bun:ffi";
import { dirname, join } from "node:path";
import type { WorkerFetch, WorkerInit, WorkerReply } from "./protocol";

declare const self: Worker;

const OPT_URL = 10002;
const OPT_PROXY = 10004;
const OPT_CUSTOMREQUEST = 10036;
const OPT_FOLLOWLOCATION = 52;
const OPT_MAXREDIRS = 68;
const OPT_TIMEOUT_MS = 155;
const OPT_CONNECTTIMEOUT_MS = 156;
const OPT_ACCEPT_ENCODING = 10102;
const MAX_REDIRECTS = 5;
const CONNECT_TIMEOUT_MS = 15_000;
const POLL_MS = 10;
const SHARE_IDLE_MS = 5 * 60 * 60 * 1000;
const SWEEP_MS = 60_000;
const COOKIE_HEADER_LINE = /^#(?!HttpOnly_)/;
const BAD_CONTENT_ENCODING = 61;

const SYMBOLS = {
  ci_init: { args: [], returns: "int" },
  ci_strerror: { args: ["int"], returns: "ptr" },
  ci_share_new: { args: [], returns: "ptr" },
  ci_share_free: { args: ["ptr"], returns: "int" },
  ci_multi_new: { args: [], returns: "ptr" },
  ci_transfer_new: { args: ["int"], returns: "ptr" },
  ci_easy_new: { args: ["ptr", "int", "ptr", "ptr"], returns: "ptr" },
  ci_set_str: { args: ["ptr", "int", "ptr"], returns: "int" },
  ci_set_long: { args: ["ptr", "int", "i64"], returns: "int" },
  ci_set_body: { args: ["ptr", "ptr", "int"], returns: "int" },
  ci_add_header: { args: ["ptr", "ptr", "ptr"], returns: "int" },
  ci_add_cookie: { args: ["ptr", "ptr"], returns: "int" },
  ci_start: { args: ["ptr", "ptr"], returns: "int" },
  ci_step: { args: ["ptr", "int"], returns: "int" },
  ci_next_done: { args: ["ptr"], returns: "ptr" },
  ci_status: { args: ["ptr"], returns: "int" },
  ci_effective_url: { args: ["ptr"], returns: "ptr" },
  ci_cookies: { args: ["ptr"], returns: "ptr" },
  ci_easy: { args: ["ptr"], returns: "ptr" },
  ci_result: { args: ["ptr"], returns: "int" },
  ci_over: { args: ["ptr"], returns: "int" },
  ci_body: { args: ["ptr"], returns: "ptr" },
  ci_body_len: { args: ["ptr"], returns: "int" },
  ci_head: { args: ["ptr"], returns: "ptr" },
  ci_head_len: { args: ["ptr"], returns: "int" },
  ci_finish: { args: ["ptr", "ptr", "ptr"], returns: "void" },
  ci_free: { args: ["ptr"], returns: "void" },
} as const;

type Lib = ReturnType<typeof _compile>;

interface Share {
  handle: Pointer;
  busy: number;
  usedAt: number;
}

interface Inflight {
  id: number;
  easy: Pointer;
  transfer: Pointer;
  share: Share;
  wantsCookies: boolean;
}

const _compile = (libPath: string) =>
  cc({
    source: join(import.meta.dir, "shim.c"),
    library: ["curl-impersonate"],
    flags: ["-nostdlib", `-L${dirname(libPath)}`],
    symbols: SYMBOLS,
  }).symbols;

const _cstr = (value: string): Buffer => Buffer.from(`${value}\0`, "utf8");

const _string = (pointer: Pointer | null): string =>
  pointer ? new CString(pointer).toString() : "";

const _bytes = (pointer: Pointer | null, length: number): ArrayBuffer =>
  pointer && length > 0
    ? toArrayBuffer(pointer, 0, length).slice(0)
    : new ArrayBuffer(0);

let lib: Lib | null = null;
let multi: Pointer | null = null;
let pumping = false;
const shares = new Map<string, Share>();
const inflight = new Map<number, Inflight>();
const byId = new Map<number, Inflight>();

const _reply = (message: WorkerReply, transfer: Transferable[] = []): void => {
  self.postMessage(message, transfer);
};

const _shareFor = (egressKey: string): Share => {
  let share = shares.get(egressKey);
  if (!share) {
    const handle = lib!.ci_share_new();
    if (!handle) throw new Error("curl-impersonate could not create a connection share");
    share = { handle, busy: 0, usedAt: Date.now() };
    shares.set(egressKey, share);
  }
  share.busy++;
  share.usedAt = Date.now();
  return share;
};

const _sweepShares = (): void => {
  const cutoff = Date.now() - SHARE_IDLE_MS;
  for (const [key, share] of shares) {
    if (share.busy > 0 || share.usedAt > cutoff) continue;
    lib!.ci_share_free(share.handle);
    shares.delete(key);
  }
};

const _release = (entry: Inflight): void => {
  inflight.delete(Number(entry.transfer));
  byId.delete(entry.id);
  lib!.ci_finish(multi!, entry.easy, entry.transfer);
  entry.share.busy--;
  entry.share.usedAt = Date.now();
};

const _contentEncoding = (transfer: Pointer): string => {
  const head = Buffer.from(_bytes(lib!.ci_head(transfer), lib!.ci_head_len(transfer))).toString("latin1");
  return /^content-encoding:\s*(.+)$/im.exec(head)?.[1]?.trim() ?? "";
};

const _settle = (transfer: Pointer): void => {
  const entry = inflight.get(Number(transfer));
  if (!entry) return;
  const code = lib!.ci_result(transfer);
  if (code !== 0) {
    const encoding = code === BAD_CONTENT_ENCODING ? _contentEncoding(transfer) : "";
    const message = lib!.ci_over(transfer)
      ? "Response too large"
      : `${_string(lib!.ci_strerror(code))}${encoding ? ` (content-encoding: ${encoding})` : ""}`;
    _release(entry);
    _reply({ type: "failed", id: entry.id, code, message });
    return;
  }
  const head = Buffer.from(_bytes(lib!.ci_head(transfer), lib!.ci_head_len(transfer))).toString("latin1");
  const body = _bytes(lib!.ci_body(transfer), lib!.ci_body_len(transfer));
  const status = lib!.ci_status(entry.easy);
  const effectiveUrl = _string(lib!.ci_effective_url(entry.easy));
  let cookieJar: string | undefined;
  if (entry.wantsCookies) {
    const cookies = lib!.ci_cookies(entry.easy);
    cookieJar = _string(cookies);
    if (cookies) lib!.ci_free(cookies);
  }
  _release(entry);
  _reply({ type: "done", id: entry.id, status, head, body, effectiveUrl, cookieJar }, [body]);
};

const _pump = async (): Promise<void> => {
  if (pumping) return;
  pumping = true;
  try {
    while (inflight.size > 0) {
      lib!.ci_step(multi!, POLL_MS);
      let done = lib!.ci_next_done(multi!);
      while (done) {
        _settle(done);
        done = lib!.ci_next_done(multi!);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    pumping = false;
  }
};

const _configure = (easy: Pointer, transfer: Pointer, req: WorkerFetch): void => {
  const l = lib!;
  l.ci_set_str(easy, OPT_URL, _cstr(req.url));
  if (req.proxyUrl) l.ci_set_str(easy, OPT_PROXY, _cstr(req.proxyUrl));
  if (req.acceptEncoding) l.ci_set_str(easy, OPT_ACCEPT_ENCODING, _cstr(req.acceptEncoding));
  l.ci_set_long(easy, OPT_FOLLOWLOCATION, req.followRedirects ? 1 : 0);
  l.ci_set_long(easy, OPT_MAXREDIRS, MAX_REDIRECTS);
  l.ci_set_long(easy, OPT_TIMEOUT_MS, req.timeoutMs);
  l.ci_set_long(easy, OPT_CONNECTTIMEOUT_MS, Math.min(req.timeoutMs, CONNECT_TIMEOUT_MS));
  const method = req.method.toUpperCase();
  if (req.body) {
    const body = Buffer.from(req.body);
    l.ci_set_body(easy, body, body.byteLength);
    if (method !== "POST") l.ci_set_str(easy, OPT_CUSTOMREQUEST, _cstr(method));
  } else if (method !== "GET") {
    l.ci_set_str(easy, OPT_CUSTOMREQUEST, _cstr(method));
  }
  for (const [name, value] of req.headers) {
    l.ci_add_header(easy, transfer, _cstr(`${name}: ${value}`));
  }
  for (const line of (req.cookieJar ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || COOKIE_HEADER_LINE.test(trimmed)) continue;
    l.ci_add_cookie(easy, _cstr(trimmed));
  }
};

const _start = (req: WorkerFetch): void => {
  const transfer = lib!.ci_transfer_new(req.maxBytes);
  if (!transfer) {
    _reply({ type: "failed", id: req.id, code: -1, message: "out of memory" });
    return;
  }
  const share = _shareFor(req.egressKey);
  const easy = lib!.ci_easy_new(_cstr(req.target), req.defaultHeaders ? 1 : 0, share.handle, transfer);
  if (!easy) {
    lib!.ci_finish(multi!, null, transfer);
    share.busy--;
    _reply({ type: "failed", id: req.id, code: -1, message: `curl-impersonate does not know the "${req.target}" profile` });
    return;
  }
  const entry: Inflight = { id: req.id, easy, transfer, share, wantsCookies: req.cookieJar !== undefined };
  inflight.set(Number(transfer), entry);
  byId.set(req.id, entry);
  _configure(easy, transfer, req);
  lib!.ci_start(multi!, easy);
  void _pump();
};

const _init = (msg: WorkerInit): void => {
  try {
    lib = _compile(msg.libPath);
    if (lib.ci_init() !== 0) throw new Error("curl_global_init failed");
    multi = lib.ci_multi_new();
    if (!multi) throw new Error("curl_multi_init failed");
    setInterval(_sweepShares, SWEEP_MS);
    _reply({ type: "ready" });
  } catch (err) {
    _reply({ type: "unavailable", message: err instanceof Error ? err.message : String(err) });
  }
};

self.onmessage = (event: MessageEvent) => {
  const msg = event.data;
  if (msg?.type === "init") return _init(msg as WorkerInit);
  if (!lib || !multi) return;
  if (msg?.type === "fetch") return _start(msg as WorkerFetch);
  if (msg?.type === "cancel") {
    const entry = byId.get(msg.id);
    if (!entry) return;
    _release(entry);
    _reply({ type: "cancelled", id: msg.id });
  }
};
