import { logger } from "../../utils/logger";

const RUNNER_TIMEOUT_MS = 60_000;
const RUNNER_KILL_SIGNAL = "SIGKILL";

const RPC_KIND = {
  FETCH: "fetch",
  CACHE: "cache",
} as const;

export interface RpcFetchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  data?: string;
  follow?: boolean;
}

export interface RpcFetchReply {
  url: string;
  status: number;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  text: string;
}

interface RpcCacheRequest {
  op: "get" | "set";
  key: string;
  value?: string;
  ttl?: number;
}

export interface RpcHandlers {
  onFetch?: (req: RpcFetchRequest) => Promise<RpcFetchReply>;
  onCache?: (req: RpcCacheRequest) => Promise<string | null>;
}

export interface RunnerSpec {
  bin: string;
  args: readonly string[];
  label: string;
}

interface RpcEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  trace?: string;
}

interface RpcMessage {
  rpc?: string;
  id?: number;
  [key: string]: unknown;
}

const _asFetchRequest = (msg: RpcMessage): RpcFetchRequest => ({
  url: String(msg.url ?? ""),
  method: String(msg.method ?? "GET"),
  headers: (msg.headers as Record<string, string>) ?? {},
  cookies: (msg.cookies as Record<string, string>) ?? {},
  data: typeof msg.data === "string" ? msg.data : undefined,
  follow: msg.follow === true,
});

const _asCacheRequest = (msg: RpcMessage): RpcCacheRequest => ({
  op: msg.op === "set" ? "set" : "get",
  key: String(msg.key ?? ""),
  value: typeof msg.value === "string" ? msg.value : undefined,
  ttl: typeof msg.ttl === "number" ? msg.ttl : undefined,
});

const _handle = async (msg: RpcMessage, handlers: RpcHandlers): Promise<unknown> => {
  if (msg.rpc === RPC_KIND.FETCH) {
    if (!handlers.onFetch) throw new Error("outbound fetch is not available here");
    return handlers.onFetch(_asFetchRequest(msg));
  }
  if (msg.rpc === RPC_KIND.CACHE) {
    if (!handlers.onCache) throw new Error("cache is not available here");
    return handlers.onCache(_asCacheRequest(msg));
  }
  throw new Error(`unknown rpc "${String(msg.rpc)}"`);
};

interface RpcStdin {
  write: (chunk: string) => unknown;
  flush: () => unknown;
}

const _reply = (
  stdin: RpcStdin,
  id: number | undefined,
  result: unknown,
  error?: string,
): void => {
  const payload = error ? { id, ok: false, error } : { id, ok: true, data: result };
  stdin.write(`${JSON.stringify(payload)}\n`);
  stdin.flush();
};

const _serve = async (
  msg: RpcMessage,
  handlers: RpcHandlers,
  stdin: RpcStdin,
  label: string,
): Promise<void> => {
  try {
    _reply(stdin, msg.id, await _handle(msg, handlers));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(label, `rpc ${String(msg.rpc)} failed: ${message}`);
    _reply(stdin, msg.id, null, message);
  }
};

const _asMessage = (line: string, label: string): RpcMessage | null => {
  try {
    return JSON.parse(line) as RpcMessage;
  } catch {
    logger.debug(label, "runner wrote something that is not json on stdout");
    return null;
  }
};

export const runBridge = async <T>(
  spec: RunnerSpec,
  scriptPath: string,
  payload: Record<string, unknown>,
  handlers: RpcHandlers = {},
): Promise<T> => {
  const proc = Bun.spawn([spec.bin, ...spec.args, scriptPath], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: RUNNER_TIMEOUT_MS,
    killSignal: RUNNER_KILL_SIGNAL,
  });
  const stderrPromise = new Response(proc.stderr).text();
  let envelope: RpcEnvelope<T> | null = null;
  let lastLine = "";
  let garbled = false;
  try {
    proc.stdin.write(`${JSON.stringify(payload)}\n`);
    proc.stdin.flush();
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of proc.stdout as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let cut = buffer.indexOf("\n");
      while (cut !== -1 && !garbled) {
        const line = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut + 1);
        if (line) {
          lastLine = line;
          const msg = _asMessage(line, spec.label);
          if (!msg) garbled = true;
          else if (msg.rpc) await _serve(msg, handlers, proc.stdin, spec.label);
          else envelope = msg as unknown as RpcEnvelope<T>;
        }
        cut = buffer.indexOf("\n");
      }
      if (garbled) break;
    }
    const tail = buffer.trim();
    if (tail && !garbled) {
      lastLine = tail;
      const msg = _asMessage(tail, spec.label);
      if (!msg) garbled = true;
      else envelope = msg as unknown as RpcEnvelope<T>;
    }
    if (garbled) envelope = null;
  } catch (err) {
    proc.kill();
    throw err;
  } finally {
    if (!envelope) proc.kill();
    try {
      proc.stdin.end();
    } catch {
      proc.kill();
    }
  }
  const [stderr, exitCode] = await Promise.all([stderrPromise, proc.exited]);
  const failure = `${spec.label} runner failed (${exitCode})`;
  if (garbled) {
    const details = [stderr.trim(), lastLine].filter(Boolean).join(" | ");
    throw new Error(
      details ? `${spec.label} runner broke the rpc protocol: ${details}` : failure,
    );
  }
  if (!envelope) throw new Error(stderr.trim() || lastLine || failure);
  if (exitCode !== 0 || !envelope.ok || envelope.data === undefined) {
    throw new Error(envelope.error || stderr.trim() || failure);
  }
  return envelope.data;
};
