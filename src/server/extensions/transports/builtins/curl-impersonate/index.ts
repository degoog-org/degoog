import { randomUUID } from "crypto";
import type {
  Transport,
  TransportContext,
  TransportFetchOptions,
} from "../../../../types";
import type { AsyncTtlCache } from "../../../../utils/cache";
import { logger } from "../../../../utils/logger";
import {
  appendCurlCookieStdoutDelimiters,
  getCookieJar,
  parseCurlStdoutWithCookieJar,
  saveCookieJar,
} from "../../utils/curl-cookie-cache";

const STATUS_DELIMITER = randomUUID();
const COOKIE_DELIMITER = randomUUID();
const COOKIE_NAMESPACE = "transport:curl-impersonate:cookies";
const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
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

const _hasBody = (method: string): boolean =>
  ["POST", "PUT", "PATCH"].includes(method);

function _buildCurlArgs(
  url: string,
  options: TransportFetchOptions,
  proxyUrl: string | undefined,
): string[] {
  const method = (options.method ?? "GET").toUpperCase();
  const args = [
    "-sS",
    "-L",
    "--max-redirs",
    "5",
    "--max-time",
    "30",
  ];

  appendCurlCookieStdoutDelimiters(args, STATUS_DELIMITER, COOKIE_DELIMITER);

  if (proxyUrl?.trim()) args.push("--proxy", proxyUrl.trim());
  if (method !== "GET" && method !== "HEAD") args.push("-X", method);
  if (options.body && _hasBody(method)) {
    args.push("--data-binary", options.body);
  }

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
): Promise<CurlRunResult> {
  const proc = Bun.spawn([binary, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

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
  ]);

  if (exitCode !== 0) {
    throw new Error(stderrText.trim() || `curl-impersonate failed (${exitCode})`);
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
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
    cookieJarText: parsed.cookieJarText,
  };
}

async function _fetchViaImpersonate(
  url: string,
  options: TransportFetchOptions,
  proxyUrl: string | undefined,
  binary: string,
  cookieCache: AsyncTtlCache<string>,
): Promise<Response> {
  const parsed = new URL(url);
  const cookieKey = parsed.hostname;
  let jar = await getCookieJar(cookieCache, cookieKey);

  if (!_warmedHosts.has(parsed.hostname)) {
    _warmedHosts.add(parsed.hostname);
    const warmupArgs = _buildCurlArgs(
      `${parsed.protocol}//${parsed.hostname}/`,
      {},
      proxyUrl,
    );
    const warmup = await _run(binary, warmupArgs, jar).catch(() => null);
    if (warmup?.cookieJarText) {
      jar = warmup.cookieJarText;
      await saveCookieJar(cookieCache, cookieKey, jar, COOKIE_TTL_MS);
    }
  }

  const args = _buildCurlArgs(url, options, proxyUrl);
  const result = await _run(binary, args, jar);
  await saveCookieJar(cookieCache, cookieKey, result.cookieJarText, COOKIE_TTL_MS);
  return result.response;
}

export class CurlImpersonateTransport implements Transport {
  name = "curl-impersonate";
  displayName = "Curl Impersonate";
  description =
    "Uses curl-impersonate to mimic Firefox TLS fingerprints. Helps with endpoints that block based on TLS fingerprinting.";

  available() {
    return _resolveBinary() !== null;
  }

  async fetch(
    url: string,
    options: TransportFetchOptions,
    context: TransportContext,
  ): Promise<Response> {
    const binary = _resolveBinary();
    if (!binary) {
      throw new Error(
        "No curl-impersonate binary found. Install curl-impersonate and ensure it is on PATH.",
      );
    }
    logger.debug("outgoing", `curl-impersonate ${new URL(url).hostname}`);
    const cookieCache = context.useCache<string>(
      COOKIE_NAMESPACE,
      COOKIE_TTL_MS,
    );
    return _fetchViaImpersonate(
      url,
      options,
      context.proxyUrl,
      binary,
      cookieCache,
    );
  }
}
