import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import {
  COOKIE_JAR_HEADER,
  appendCurlCookieStdoutDelimiters,
  cookieJarFromCookieHeader,
  emptyCookieJar,
  parseCurlStdoutWithCookieJar,
} from "../../src/server/extensions/transports/utils/curl-cookie-cache";

describe("curl-cookie-cache", () => {
  test("emptyCookieJar returns a valid Netscape header", () => {
    const jar = emptyCookieJar();
    expect(jar).toBe(COOKIE_JAR_HEADER);
    expect(jar.startsWith("# Netscape HTTP Cookie File")).toBe(true);
  });

  test("cookieJarFromCookieHeader creates rows for each cookie", () => {
    const jar = cookieJarFromCookieHeader(
      "https://www.google.com",
      "NID=abc; SOCS=xyz",
    );
    const rows = jar
      .split("\n")
      .filter((line) => line && !line.startsWith("#"));

    expect(rows.length).toBe(2);
    expect(rows[0]).toBe("www.google.com\tFALSE\t/\tTRUE\t0\tNID\tabc");
    expect(rows[1]).toBe("www.google.com\tFALSE\t/\tTRUE\t0\tSOCS\txyz");
  });

  test("cookieJarFromCookieHeader marks http origins as insecure", () => {
    const jar = cookieJarFromCookieHeader("http://example.com", "a=1");
    expect(jar).toContain("example.com\tFALSE\t/\tFALSE\t0\ta\t1");
  });

  test("parseCurlStdoutWithCookieJar extracts body, status, and jar", () => {
    const statusDelim = randomUUID();
    const cookieDelim = randomUUID();
    const jar = `${COOKIE_JAR_HEADER}127.0.0.1\tFALSE\t/\tFALSE\t0\tnextcookie\txyz\n`;
    const stdout = `<html>ok</html>\n${statusDelim}200\n${cookieDelim}\n${jar}`;

    const parsed = parseCurlStdoutWithCookieJar(stdout, statusDelim, cookieDelim);
    expect(parsed.bodyText).toBe("<html>ok</html>");
    expect(parsed.status).toBe(200);
    expect(parsed.cookieJarText).toBe(jar);
  });

  test("parseCurlStdoutWithCookieJar returns null jar when delimiter absent", () => {
    const statusDelim = randomUUID();
    const cookieDelim = randomUUID();
    const stdout = `body here\n${statusDelim}404`;

    const parsed = parseCurlStdoutWithCookieJar(stdout, statusDelim, cookieDelim);
    expect(parsed.bodyText).toBe("body here");
    expect(parsed.status).toBe(404);
    expect(parsed.cookieJarText).toBeNull();
  });

  test("parseCurlStdoutWithCookieJar tolerates newlines in body", () => {
    const statusDelim = randomUUID();
    const cookieDelim = randomUUID();
    const body = "line one\nline two\nline three";
    const stdout = `${body}\n${statusDelim}200\n${cookieDelim}\n${COOKIE_JAR_HEADER}`;

    const parsed = parseCurlStdoutWithCookieJar(stdout, statusDelim, cookieDelim);
    expect(parsed.bodyText).toBe(body);
    expect(parsed.status).toBe(200);
    expect(parsed.cookieJarText).toBe(COOKIE_JAR_HEADER);
  });

  test("appendCurlCookieStdoutDelimiters adds no-disk cookie flags", () => {
    const statusDelim = "STATUS";
    const cookieDelim = "COOKIE";
    const args: string[] = [];
    appendCurlCookieStdoutDelimiters(args, statusDelim, cookieDelim);

    expect(args).toContain("-b");
    expect(args).toContain("-c");
    const dashIndexes = args
      .map((arg, i) => (arg === "-" ? i : -1))
      .filter((i) => i >= 0);
    expect(dashIndexes.length).toBe(2);
    expect(args).toContain(`\n${statusDelim}%{http_code}\n${cookieDelim}\n`);
  });
});

const curlAvailable = (): boolean => {
  try {
    return Bun.spawnSync(["curl", "--version"]).exitCode === 0;
  } catch {
    return false;
  }
};

describe("curl-cookie-cache no-disk curl flow", () => {
  test("curl reads cookies from stdin and writes updated jar to stdout", async () => {
    if (!curlAvailable()) {
      return;
    }

    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        const cookie = req.headers.get("cookie") ?? "";
        return new Response(`seen:${cookie}`, {
          headers: { "Set-Cookie": "nextcookie=xyz; Path=/" },
        });
      },
    });

    try {
      const statusDelim = randomUUID();
      const cookieDelim = randomUUID();
      const args = [
        "-sS",
        "-L",
        "-b",
        "-",
        "-c",
        "-",
        "-w",
        `\n${statusDelim}%{http_code}\n${cookieDelim}\n`,
        "--",
        `http://127.0.0.1:${server.port}/`,
      ];
      const seedJar =
        "# Netscape HTTP Cookie File\n127.0.0.1\tFALSE\t/\tFALSE\t0\tseedcookie\tabc\n";

      const proc = Bun.spawn(["curl", ...args], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      proc.stdin?.write(seedJar);
      proc.stdin?.end();

      const [stdout, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
      ]);
      expect(exitCode).toBe(0);

      const parsed = parseCurlStdoutWithCookieJar(stdout, statusDelim, cookieDelim);
      expect(parsed.status).toBe(200);
      expect(parsed.bodyText).toContain("seedcookie=abc");
      expect(parsed.cookieJarText).toContain("nextcookie");
    } finally {
      server.stop(true);
    }
  });
});
