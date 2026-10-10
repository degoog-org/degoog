import { randomUUID } from "crypto";
import type {
  Transport,
  TransportContext,
  TransportFetchOptions,
} from "../../../../types/extension";
import type { AsyncTtlCache } from "../../../../utils/cache/cache";
import { logger } from "../../../../utils/logger";
import {
  COOKIE_JAR_HEADER,
  appendCurlCookieStdoutDelimiters,
  getCookieJar,
  parseCurlStdoutWithCookieJar,
  saveCookieJar,
} from "../../utils/curl-cookie-cache";
import { withCurlBodyArgs } from "../../utils/curl-body-file";
import { killOnAbort } from "../../utils/kill-on-abort";
import { curlFailure } from "../../utils/curl-failure";
import { DIRECT_EGRESS } from "../../../../utils/net/proxy-bench";
import { impersonateAvailable, impersonateFetch } from "../../../../utils/net/impersonate";

const STATUS_DELIMITER = randomUUID();
const COOKIE_DELIMITER = randomUUID();
const COOKIE_NAMESPACE = "transport:curl-impersonate:cookies";
const COOKIE_TTL_MS = 5 * 60 * 60 * 1000;
const TIMEOUT_MS = 30_000;
const BINARIES = [
  "curl_firefox135",
  "curl_firefox133",
  "curl_ff133",
  "curl_ff117",
  "curl_ff",
  "curl-impersonate-ff",
] as const;
const STRIP_HEADERS = new Set(["user-agent", "accept-encoding", "accept"]);

const _warmedHosts = new Set<string>();

function _resolveBinary(): string | null {
  for (const bin of BINARIES) {
    try {
      const result = Bun.spawnSync([bin, "--version"]);
      if (result.exitCode === 0) return bin;
    } catch (err) {
      logger.debug("transport:curl-impersonate", `binary probe failed for ${bin}`, err);
      continue;
    }
  }
  return null;
}

function _buildCurlArgs(
  url: string,
  options: TransportFetchOptions,
  proxyUrl: string | undefined,
  bodyArgs: string[] = [],
): string[] {
  const method = (options.method ?? "GET").toUpperCase();
  const args = [
    "-sS",
    ...(options.redirect === "manual" ? [] : ["-L", "--max-redirs", "5"]),
    "--max-time",
    "30",
  ];

  appendCurlCookieStdoutDelimiters(args, STATUS_DELIMITER, COOKIE_DELIMITER);

  if (proxyUrl?.trim()) args.push("--proxy", proxyUrl.trim());
  if (method !== "GET" && method !== "HEAD") args.push("-X", method);
  args.push(...bodyArgs);

  for (const [k, v] of Object.entries(options.headers ?? {})) {
    if (!STRIP_HEADERS.has(k.toLowerCase())) {
      args.push(
        "-H",
        `${k.replace(/[\r\n]/g, "")}: ${String(v).replace(/[\r\n]/g, "")}`,
      );
    }
  }

  args.push("--", url);
  return args;
}

interface CurlRunResult {
  response: Response;
  cookieJarText: string | null;
}

async function _run(
  binary: string,
  args: string[],
  cookieJarText: string,
  signal: AbortSignal | undefined,
  proxied: boolean,
): Promise<CurlRunResult> {
  signal?.throwIfAborted();
  const proc = Bun.spawn([binary, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const release = killOnAbort(proc, signal);

  const stdin = proc.stdin;
  if (stdin) {
    try {
      stdin.write(cookieJarText);
      stdin.end();
    } catch (err) {
      logger.debug("transport:curl-impersonate", "stdin write failed, killing process", err);
      proc.kill();
    }
  }

  const [stdoutBuf, stderrText, exitCode] = await Promise.all([
    Bun.readableStreamToBytes(proc.stdout),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(release);

  signal?.throwIfAborted();
  if (exitCode !== 0) {
    throw curlFailure(
      exitCode,
      stderrText.trim() || `curl-impersonate failed (${exitCode})`,
      proxied,
    );
  }

  const output = new TextDecoder().decode(stdoutBuf);
  const parsed = parseCurlStdoutWithCookieJar(
    output,
    STATUS_DELIMITER,
    COOKIE_DELIMITER,
  );

  return {
    response: new Response(parsed.bodyText, {
      status: parsed.status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...(parsed.location ? { Location: parsed.location } : {}),
      },
    }),
    cookieJarText: parsed.cookieJarText,
  };
}

type Send = (
  url: string,
  options: TransportFetchOptions,
  jar: string,
) => Promise<CurlRunResult>;

const _passHeaders = (headers: TransportFetchOptions["headers"]): [string, string][] =>
  Object.entries(headers ?? {}).filter(([k]) => !STRIP_HEADERS.has(k.toLowerCase()));

const _viaLibrary = (context: TransportContext): Send => async (url, options, jar) => {
  const { response, cookieJar } = await impersonateFetch({
    url,
    method: options.method,
    headers: _passHeaders(options.headers),
    body: options.body,
    proxyUrl: context.proxyUrl,
    egressKey: context.egressKey ?? DIRECT_EGRESS,
    followRedirects: options.redirect !== "manual",
    timeoutMs: TIMEOUT_MS,
    cookieJar: jar,
    signal: options.signal,
  });
  return {
    response,
    cookieJarText: cookieJar === undefined ? null : `${COOKIE_JAR_HEADER}${cookieJar}`,
  };
};

const _viaBinary = (binary: string, context: TransportContext): Send => {
  const proxied = Boolean(context.proxyUrl?.trim());
  return (url, options, jar) =>
    withCurlBodyArgs(options, (bodyArgs) =>
      _run(binary, _buildCurlArgs(url, options, context.proxyUrl, bodyArgs), jar, options.signal, proxied),
    );
};

async function _fetchViaImpersonate(
  url: string,
  options: TransportFetchOptions,
  context: TransportContext,
  send: Send,
  cookieCache: AsyncTtlCache<string>,
): Promise<Response> {
  const parsed = new URL(url);
  const cookieKey = `${context.egressKey ?? DIRECT_EGRESS}|${parsed.hostname}`;
  let jar = await getCookieJar(cookieCache, cookieKey);

  if (!_warmedHosts.has(cookieKey)) {
    _warmedHosts.add(cookieKey);
    const warmup = await send(
      `${parsed.protocol}//${parsed.hostname}/`,
      { signal: options.signal },
      jar,
    ).catch(() => null);
    if (warmup?.cookieJarText) {
      jar = warmup.cookieJarText;
      await saveCookieJar(cookieCache, cookieKey, jar, COOKIE_TTL_MS);
    }
  }

  const result = await send(url, options, jar);
  await saveCookieJar(cookieCache, cookieKey, result.cookieJarText, COOKIE_TTL_MS);
  return result.response;
}

export class CurlImpersonateTransport implements Transport {
  name = "curl-impersonate";
  usesContextProxy = true;
  displayName = "Curl Impersonate";
  description =
    "Uses curl-impersonate to mimic Firefox TLS fingerprints. Helps with endpoints that block based on TLS fingerprinting. With libcurl-impersonate installed it also keeps connections open per proxy like a browser does, instead of starting a new connection for every request.";

  async available() {
    return _resolveBinary() !== null || (await impersonateAvailable());
  }

  async fetch(
    url: string,
    options: TransportFetchOptions,
    context: TransportContext,
  ): Promise<Response> {
    const viaLibrary = await impersonateAvailable();
    const binary = viaLibrary ? null : _resolveBinary();
    if (!viaLibrary && !binary) {
      throw new Error(
        "No curl-impersonate found. Install libcurl-impersonate or the curl-impersonate binaries.",
      );
    }
    logger.debug("outgoing", `curl-impersonate ${new URL(url).hostname}${viaLibrary ? " (library)" : ""}`);
    const cookieCache = context.useCache<string>(
      COOKIE_NAMESPACE,
      COOKIE_TTL_MS,
    );
    const send = viaLibrary ? _viaLibrary(context) : _viaBinary(binary!, context);
    return _fetchViaImpersonate(url, options, context, send, cookieCache);
  }
}
