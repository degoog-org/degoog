import { afterEach, describe, expect, test } from "bun:test";
import net from "node:net";
import { gzipSync } from "node:zlib";
import { fetchViaHttpProxy } from "../../../src/server/utils/net/http-proxy-fetch";
import { fetchViaSocks, isSocksProxy } from "../../../src/server/utils/net/socks-fetch";

type Seen = { tunnel?: string; requests: string[]; bodies: string[] };
type Reply = (requestHead: string) => Buffer;

const servers: net.Server[] = [];

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

const listen = async (server: net.Server): Promise<number> => {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as net.AddressInfo).port;
};

const serveHttp = (sock: net.Socket, seen: Seen, reply: Reply, initial = ""): void => {
  let buf = initial;
  const onData = (chunk: Buffer): void => {
    buf += chunk.toString("latin1");
    const end = buf.indexOf("\r\n\r\n");
    if (end === -1) return;
    const head = buf.slice(0, end);
    const length = Number(head.match(/content-length: (\d+)/i)?.[1] ?? 0);
    const body = Buffer.from(buf.slice(end + 4), "latin1");
    if (body.length < length) return;
    sock.removeListener("data", onData);
    seen.requests.push(head);
    seen.bodies.push(body.toString("utf8"));
    sock.end(reply(head));
  };
  sock.on("data", onData);
  if (initial) onData(Buffer.alloc(0));
};

const connectProxy = async (reply: Reply, tunnelStatus = 200): Promise<{ port: number; seen: Seen }> => {
  const seen: Seen = { requests: [], bodies: [] };
  const port = await listen(
    net.createServer((sock) => {
      let buf = "";
      const onConnect = (chunk: Buffer): void => {
        buf += chunk.toString("latin1");
        const end = buf.indexOf("\r\n\r\n");
        if (end === -1) return;
        sock.removeListener("data", onConnect);
        seen.tunnel = buf.slice(0, end);
        sock.write(`HTTP/1.1 ${tunnelStatus} Whatever\r\n\r\n`);
        if (tunnelStatus !== 200) return;
        serveHttp(sock, seen, reply, buf.slice(end + 4));
      };
      sock.on("data", onConnect);
    }),
  );
  return { port, seen };
};

const socks5Proxy = async (reply: Reply): Promise<{ port: number; seen: Seen }> => {
  const seen: Seen = { requests: [], bodies: [] };
  const port = await listen(
    net.createServer((sock) => {
      let stage = 0;
      const onData = (chunk: Buffer): void => {
        if (stage === 0) {
          stage = 1;
          sock.write(Buffer.from([5, 0]));
          return;
        }
        sock.removeListener("data", onData);
        const atyp = chunk[3];
        const hostLen = atyp === 3 ? chunk[4] : 4;
        const hostStart = atyp === 3 ? 5 : 4;
        const host =
          atyp === 3
            ? chunk.subarray(hostStart, hostStart + hostLen).toString()
            : [...chunk.subarray(4, 8)].join(".");
        const target = chunk.readUInt16BE(hostStart + hostLen);
        seen.tunnel = `${host}:${target}`;
        sock.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
        serveHttp(sock, seen, reply);
      };
      sock.on("data", onData);
    }),
  );
  return { port, seen };
};

const http = (status: string, headers: Record<string, string>, body: Buffer | string = ""): Buffer => {
  const b = typeof body === "string" ? Buffer.from(body) : body;
  const lines = [`HTTP/1.1 ${status}`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`)];
  return Buffer.concat([Buffer.from(lines.join("\r\n") + "\r\n\r\n", "latin1"), b]);
};

const chunked = (parts: string[]): string =>
  parts.map((p) => `${Buffer.byteLength(p).toString(16)}\r\n${p}\r\n`).join("") + "0\r\n\r\n";

describe("http CONNECT proxy fetch", () => {
  test("tunnels with basic auth and sends a close-delimited request", async () => {
    const { port, seen } = await connectProxy(() => http("200 OK", { "X-Reply": "yes" }, "hello"));
    const res = await fetchViaHttpProxy(
      "http://target.test:8081/path?q=1",
      `http://us%20er:p%40ss@127.0.0.1:${port}`,
      { headers: { "X-Custom": "c" } },
    );
    expect(res.status).toBe(200);
    expect(res.statusText).toBe("OK");
    expect(res.headers.get("x-reply")).toBe("yes");
    expect(await res.text()).toBe("hello");
    expect(seen.tunnel).toBe(
      `CONNECT target.test:8081 HTTP/1.1\r\nHost: target.test:8081\r\nProxy-Authorization: Basic ${Buffer.from("us er:p@ss").toString("base64")}`,
    );
    expect(seen.requests[0].split("\r\n")).toEqual([
      "GET /path?q=1 HTTP/1.1",
      "X-Custom: c",
      "Host: target.test:8081",
      "Connection: close",
      "Accept-Encoding: gzip, deflate, br",
    ]);
  });

  test("posts a body with its length and decodes chunked gzip", async () => {
    const zipped = gzipSync(Buffer.from("unzipped text"));
    const { port, seen } = await connectProxy(() =>
      http("201 Created", { "Transfer-Encoding": "chunked", "Content-Encoding": "gzip" },
        Buffer.concat([
          Buffer.from(`${zipped.length.toString(16)}\r\n`),
          zipped,
          Buffer.from("\r\n0\r\n\r\n"),
        ])),
    );
    const res = await fetchViaHttpProxy("http://t.test/submit", `http://127.0.0.1:${port}`, {
      method: "POST",
      body: "a=é",
    });
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("unzipped text");
    expect(seen.tunnel).not.toContain("Proxy-Authorization");
    expect(seen.requests[0]).toContain("POST /submit HTTP/1.1");
    expect(seen.requests[0]).toContain("Content-Length: 4");
    expect(seen.bodies[0]).toBe("a=é");
  });

  test("follows redirects unless told not to", async () => {
    const reply: Reply = (head) =>
      head.startsWith("GET /start")
        ? http("302 Found", { Location: "/end" })
        : http("200 OK", { "Transfer-Encoding": "chunked" }, chunked(["fin", "al"]));
    const followed = await connectProxy(reply);
    const res = await fetchViaHttpProxy("http://t.test/start", `http://127.0.0.1:${followed.port}`);
    expect(await res.text()).toBe("final");
    expect(followed.seen.requests.map((r) => r.split("\r\n")[0])).toEqual([
      "GET /start HTTP/1.1",
      "GET /end HTTP/1.1",
    ]);

    const manual = await connectProxy(reply);
    const stopped = await fetchViaHttpProxy("http://t.test/start", `http://127.0.0.1:${manual.port}`, {
      redirect: "manual",
    });
    expect(stopped.status).toBe(302);
    expect(stopped.headers.get("location")).toBe("/end");
  });

  test("a refused tunnel rejects with its status", async () => {
    const { port } = await connectProxy(() => http("200 OK", {}), 407);
    await expect(fetchViaHttpProxy("http://t.test/", `http://127.0.0.1:${port}`)).rejects.toThrow(
      "CONNECT tunnel failed with status 407",
    );
  });
});

describe("socks proxy fetch", () => {
  test("recognises socks schemes only", () => {
    expect(isSocksProxy("socks5://h:1")).toBe(true);
    expect(isSocksProxy("SOCKS4://h:1")).toBe(true);
    expect(isSocksProxy("socks5h://h:1")).toBe(true);
    expect(isSocksProxy("socks4a://h:1")).toBe(true);
    expect(isSocksProxy("http://h:1")).toBe(false);
  });

  test("connects through socks5 and speaks the same http", async () => {
    const reply: Reply = (head) =>
      head.startsWith("GET /start")
        ? http("301 Moved", { Location: "http://t.test:9000/end" })
        : http("200 OK", { "X-Via": "socks" }, "through socks");
    const { port, seen } = await socks5Proxy(reply);
    const res = await fetchViaSocks("http://t.test:9000/start", `socks5://127.0.0.1:${port}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-via")).toBe("socks");
    expect(await res.text()).toBe("through socks");
    expect(seen.tunnel).toBe("t.test:9000");
    expect(seen.requests.map((r) => r.split("\r\n")[0])).toEqual([
      "GET /start HTTP/1.1",
      "GET /end HTTP/1.1",
    ]);
    expect(seen.requests[0]).toContain("Host: t.test:9000");
  });
});
