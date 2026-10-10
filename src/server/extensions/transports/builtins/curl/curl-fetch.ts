import { randomUUID } from "crypto";
import type { TransportFetchOptions } from "../../../../types/extension";
import { logger } from "../../../../utils/logger";
import { withCurlBodyArgs } from "../../utils/curl-body-file";
import { killOnAbort } from "../../utils/kill-on-abort";
import { curlFailure } from "../../utils/curl-failure";

const DEFAULT_TIMEOUT_SEC = 60;
const DELIMITER = randomUUID();

function buildCurlArgs(
  url: string,
  options: TransportFetchOptions,
  proxyUrl: string | undefined,
  timeoutSec: number,
  bodyArgs: string[],
): string[] {
  const method = options.method ?? "GET";
  const args = [
    "-sS",
    ...(options.redirect === "manual" ? [] : ["-L", "--max-redirs", "5"]),
    "--compressed",
    "--max-time",
    String(timeoutSec),
    "-w",
    `\n${DELIMITER}%{http_code}${DELIMITER}%{redirect_url}`,
  ];

  if (proxyUrl?.trim()) {
    args.push("--proxy", proxyUrl.trim());
  }

  if (method !== "GET" && method !== "HEAD") {
    args.push("-X", method);
  }

  args.push(...bodyArgs);
  args.push("-H", "@-");
  args.push("--", url);

  return args;
}

export async function fetchViaCurl(
  url: string,
  options: TransportFetchOptions = {},
  proxyUrl?: string,
): Promise<Response> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Invalid protocol");
  }

  options.signal?.throwIfAborted();
  return withCurlBodyArgs(options, (bodyArgs) =>
    _runCurl(
      buildCurlArgs(url, options, proxyUrl, DEFAULT_TIMEOUT_SEC, bodyArgs),
      options,
      Boolean(proxyUrl?.trim()),
    ),
  );
}

async function _runCurl(
  args: string[],
  options: TransportFetchOptions,
  proxied: boolean,
): Promise<Response> {
  options.signal?.throwIfAborted();

  const proc = Bun.spawn(["curl", ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const release = killOnAbort(proc, options.signal);

  const headerPayload = Object.entries(options.headers ?? {})
    .filter(([k]) => k.trim())
    .map(
      ([k, v]) =>
        `${k.replace(/[\r\n]/g, "")}: ${String(v).replace(/[\r\n]/g, "")}`,
    )
    .join("\n");

  const writeToStdin = async () => {
    try {
      proc.stdin.write(headerPayload + "\n");
      proc.stdin.end();
    } catch (err) {
      logger.debug("transport:curl", "stdin write failed, killing process", err);
      proc.kill();
    }
  };

  writeToStdin();

  const [stdoutBuf, stderrText, exitCode] = await Promise.all([
    Bun.readableStreamToBytes(proc.stdout),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(release);

  options.signal?.throwIfAborted();
  if (exitCode !== 0) {
    throw curlFailure(exitCode, stderrText.trim() || `Curl failed (${exitCode})`, proxied);
  }

  const output = new TextDecoder().decode(stdoutBuf);
  const parts = output.split(`${DELIMITER}`);
  const bodyText = parts[0].replace(/\n$/, "");
  const statusNum = parseInt(parts[1] ?? "502", 10);
  const location = parts[2]?.trim();

  return new Response(bodyText, {
    status: statusNum >= 100 ? statusNum : 502,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...(location ? { Location: location } : {}),
    },
  });
}
