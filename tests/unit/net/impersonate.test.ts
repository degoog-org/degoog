import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import net from "node:net";
import { gzipSync } from "node:zlib";
import {
  findImpersonateLibrary,
  impersonateAvailable,
  impersonateFetch,
} from "../../../src/server/utils/net/impersonate";
import { isProxyConnectError } from "../../../src/server/utils/net/proxy-error";

const hasLibrary = findImpersonateLibrary() !== null;

let server: net.Server;
let port = 0;
let connections = 0;
const requests: string[] = [];

const GZIPPED = gzipSync("decoded body");

const reply = (head: string): string | Buffer => {
  const [line] = head.split("\r\n");
  const path = line.split(" ")[1] ?? "/";
  const cookie = /^cookie:\s*(.*)$/im.exec(head)?.[1] ?? "";
  if (path === "/redirect") {
    return "HTTP/1.1 302 Found\r\nLocation: /landed\r\nContent-Length: 0\r\n\r\n";
  }
  if (path === "/gzip") {
    return Buffer.concat([
      Buffer.from(
        `HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: ${GZIPPED.length}\r\n\r\n`,
      ),
      GZIPPED,
    ]);
  }
  if (path === "/set") {
    return "HTTP/1.1 200 OK\r\nSet-Cookie: fresh=yes; Path=/\r\nContent-Length: 2\r\n\r\nok";
  }
  const body = `${line.split(" ")[0]} ${path} cookie=${cookie}`;
  return `HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
};

beforeAll(async () => {
  server = net.createServer((sock) => {
    connections++;
    let buffered = "";
    sock.on("data", (chunk) => {
      buffered += chunk.toString("latin1");
      for (;;) {
        const end = buffered.indexOf("\r\n\r\n");
        if (end === -1) return;
        const head = buffered.slice(0, end);
        const length = Number(/^content-length:\s*(\d+)$/im.exec(head)?.[1] ?? 0);
        if (buffered.length < end + 4 + length) return;
        requests.push(buffered.slice(0, end + 4 + length));
        buffered = buffered.slice(end + 4 + length);
        sock.write(reply(head));
      }
    });
    sock.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as net.AddressInfo).port;
});

afterAll(() => {
  server.close();
});

describe.skipIf(!hasLibrary)("libcurl-impersonate client", () => {
  const url = (path: string): string => `http://127.0.0.1:${port}${path}`;

  test("loads the library", async () => {
    expect(await impersonateAvailable()).toBe(true);
  });

  test("requests with the same egress share one connection, others get their own", async () => {
    const before = connections;
    for (let i = 0; i < 3; i++) {
      const { response } = await impersonateFetch({ url: url(`/same/${i}`), egressKey: "same" });
      expect(await response.text()).toBe(`GET /same/${i} cookie=`);
    }
    expect(connections - before).toBe(1);

    await impersonateFetch({ url: url("/other"), egressKey: "other" });
    expect(connections - before).toBe(2);
  });

  test("compressed responses come back decoded", async () => {
    const { response } = await impersonateFetch({ url: url("/gzip"), egressKey: "gzip" });
    expect(await response.text()).toBe("decoded body");
    expect(response.headers.get("content-encoding")).toBeNull();
  });

  test("sends bodies and methods", async () => {
    const { response } = await impersonateFetch({
      url: url("/submit"),
      method: "POST",
      body: "a=1&b=2",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      egressKey: "post",
    });
    expect(await response.text()).toBe("POST /submit cookie=");
    expect(requests.at(-1)).toEndWith("a=1&b=2");
  });

  test("cookies go in from the jar and come back out with the new ones", async () => {
    const jar = `127.0.0.1\tFALSE\t/\tFALSE\t0\tkept\tthere\n`;
    const sent = await impersonateFetch({ url: url("/echo"), egressKey: "jar", cookieJar: jar });
    expect(await sent.response.text()).toBe("GET /echo cookie=kept=there");

    const set = await impersonateFetch({ url: url("/set"), egressKey: "jar", cookieJar: jar });
    expect(set.cookieJar).toContain("\tkept\tthere");
    expect(set.cookieJar).toContain("\tfresh\tyes");
  });

  test("a manual redirect hands the location back", async () => {
    const { response } = await impersonateFetch({
      url: url("/redirect"),
      egressKey: "redirect",
      followRedirects: false,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/landed");
  });

  test("a proxy that can't be reached is reported as the proxy's fault", async () => {
    const err = await impersonateFetch({
      url: url("/x"),
      egressKey: "dead",
      proxyUrl: "socks5://127.0.0.1:1",
    }).catch((e: unknown) => e);
    expect(isProxyConnectError(err)).toBe(true);
  });

  test("an aborted request rejects with the abort reason", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      impersonateFetch({ url: url("/x"), egressKey: "abort", signal: ac.signal }),
    ).rejects.toThrow();
  });
});
