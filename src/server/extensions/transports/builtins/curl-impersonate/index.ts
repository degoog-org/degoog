import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type {
  Transport,
  TransportContext,
  TransportFetchOptions,
} from "../../../../types";
import { logger } from "../../../../utils/logger";

const DELIMITER = randomUUID();
const COOKIE_JAR_DIR = join(tmpdir(), "degoog-cookies");
const BINARIES = [
  "curl_firefox135",
  "curl_firefox133",
  "curl_ff133",
  "curl_ff117",
  "curl_ff",
  "curl-impersonate-ff",
] as const;
const STRIP_HEADERS = new Set(["user-agent", "accept-encoding", "accept"]);

try {
  mkdirSync(COOKIE_JAR_DIR, { recursive: true });
} catch { }

const _warmedHosts = new Set<string>();

function _cookieJarPath(host: string): string {
  return join(COOKIE_JAR_DIR, host.replace(/[^a-z0-9.-]/gi, "_") + ".txt");
}

function _resolveBinary(): string | null {
  for (const bin of BINARIES) {
    try {
      const result = Bun.spawnSync([bin, "--version"]);
      if (result.exitCode === 0) return bin;
    } catch {
      continue;
    }
  }
  return null;
}

function _buildCurlArgs(
  url: string,
  options: TransportFetchOptions,
  proxyUrl: string | undefined,
  cookieJar: string,
): string[] {
  const method = options.method ?? "GET";
  const args = [
    "-sS",
    "-L",
    "--max-redirs",
    "5",
    "--max-time",
    "30",
    "-w",
    `\n${DELIMITER}%{http_code}`,
    "-c",
    cookieJar,
    "-b",
    cookieJar,
  ];

  if (proxyUrl?.trim()) args.push("--proxy", proxyUrl.trim());
  if (method !== "GET" && method !== "HEAD") args.push("-X", method);

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

async function _run(
  binary: string,
  args: string[],
  body: string | undefined,
  method: string | undefined,
): Promise<Response> {
  const proc = Bun.spawn([binary, ...args], {
    stdin: body ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (body && ["POST", "PUT", "PATCH"].includes(method ?? "")) {
    const stdin = proc.stdin;
    if (stdin) {
      try {
        stdin.write(body);
        stdin.end();
      } catch {
        proc.kill();
      }
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
  const delimIdx = output.lastIndexOf(`\n${DELIMITER}`);
  const bodyText = delimIdx >= 0 ? output.slice(0, delimIdx) : output;
  const statusNum = parseInt(
    delimIdx >= 0 ? output.slice(delimIdx + DELIMITER.length + 1) : "502",
    10,
  );

  return new Response(bodyText, {
    status: statusNum >= 100 ? statusNum : 502,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function _fetchViaImpersonate(
  url: string,
  options: TransportFetchOptions,
  proxyUrl: string | undefined,
  binary: string,
): Promise<Response> {
  const parsed = new URL(url);
  const cookieJar = _cookieJarPath(parsed.hostname);
  const method = options.method ?? "GET";

  if (!_warmedHosts.has(parsed.hostname)) {
    _warmedHosts.add(parsed.hostname);
    const warmupArgs = _buildCurlArgs(
      `${parsed.protocol}//${parsed.hostname}/`,
      {},
      proxyUrl,
      cookieJar,
    );
    await _run(binary, warmupArgs, undefined, "GET").catch(() => { });
  }

  const args = _buildCurlArgs(url, options, proxyUrl, cookieJar);
  return _run(binary, args, options.body, method);
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
    return _fetchViaImpersonate(url, options, context.proxyUrl, binary);
  }
}
