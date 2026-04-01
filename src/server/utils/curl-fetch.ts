import { randomUUID } from "crypto";
import type { OutgoingFetchOptions } from "./outgoing";

const DEFAULT_TIMEOUT_SEC = 60;
const DELIMITER = randomUUID();

function buildCurlArgs(
  url: string,
  options: OutgoingFetchOptions,
  proxyUrl: string | undefined,
  timeoutSec: number,
): string[] {
  const method = options.method ?? "GET";
  const args = [
    "-sS",
    "-L",
    "--max-redirs",
    "5",
    "--compressed",
    "--max-time",
    String(timeoutSec),
    "-w",
    `\n${DELIMITER}%{http_code}`,
  ];

  if (proxyUrl?.trim()) {
    args.push("--proxy", proxyUrl.trim());
  }

  if (method !== "GET" && method !== "HEAD") {
    args.push("-X", method);
  }

  args.push("-H", "@-");
  args.push("--", url);

  return args;
}

export async function fetchViaCurl(
  url: string,
  options: OutgoingFetchOptions = {},
  proxyUrl?: string,
): Promise<Response> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Invalid protocol");
  }

  const timeoutSec = Math.min(300, Math.max(1, DEFAULT_TIMEOUT_SEC));
  const args = buildCurlArgs(url, options, proxyUrl, timeoutSec);

  const proc = Bun.spawn(["curl", ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  const headerPayload = Object.entries(options.headers ?? {})
    .filter(([k]) => k.trim())
    .map(
      ([k, v]) =>
        `${k.replace(/[\r\n]/g, "")}: ${String(v).replace(/[\r\n]/g, "")}`,
    )
    .join("\n");

  const writeToStdin = async () => {
    try {
      proc.stdin.write(headerPayload + "\n\n");
      if (
        options.body &&
        ["POST", "PUT", "PATCH"].includes(options.method ?? "")
      ) {
        proc.stdin.write(options.body);
      }
      proc.stdin.end();
    } catch {
      proc.kill();
    }
  };

  writeToStdin();

  const [stdoutBuf, stderrText, exitCode] = await Promise.all([
    Bun.readableStreamToBytes(proc.stdout),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderrText.trim() || `Curl failed (${exitCode})`);
  }

  const output = new TextDecoder().decode(stdoutBuf);
  const parts = output.split(`${DELIMITER}`);
  const bodyText = parts[0].replace(/\n$/, "");
  const statusNum = parseInt(parts[1] ?? "502", 10);

  return new Response(bodyText, {
    status: statusNum >= 100 ? statusNum : 502,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
