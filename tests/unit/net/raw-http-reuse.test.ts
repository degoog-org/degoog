import { afterEach, describe, expect, test } from "bun:test";
import net from "node:net";
import {
  closeIdleConnections,
  fetchOverSocket,
} from "../../../src/server/utils/net/raw-http";

const servers: net.Server[] = [];

afterEach(() => {
  closeIdleConnections();
  for (const s of servers.splice(0)) s.close();
});

type Reply = (path: string) => string;

const lengthReply = (body: string, extra = ""): string =>
  `HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${extra}\r\n${body}`;

const chunkedReply = (parts: string[]): string =>
  `HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n${parts
    .map((p) => `${Buffer.byteLength(p).toString(16)}\r\n${p}\r\n`)
    .join("")}0\r\n\r\n`;

const keepAliveServer = async (
  reply: Reply,
  opts: { closeAfterEach?: boolean } = {},
): Promise<{ port: number; connections: () => number }> => {
  let connections = 0;
  const server = net.createServer((sock) => {
    connections++;
    let buffered = "";
    sock.on("data", (chunk) => {
      buffered += chunk.toString("latin1");
      let end = buffered.indexOf("\r\n\r\n");
      while (end !== -1) {
        const path = buffered.split(" ")[1] ?? "/";
        buffered = buffered.slice(end + 4);
        sock.write(reply(path));
        if (opts.closeAfterEach) sock.end();
        end = buffered.indexOf("\r\n\r\n");
      }
    });
    sock.on("error", () => {});
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as net.AddressInfo).port,
    connections: () => connections,
  };
};

const opener = (port: number) => (): Promise<net.Socket> =>
  new Promise((resolve, reject) => {
    const sock = net.connect(port, "127.0.0.1");
    sock.once("connect", () => resolve(sock));
    sock.once("error", reject);
  });

describe("raw-http connection reuse", () => {
  test("requests with the same reuse key share one connection and one exit", async () => {
    const { port, connections } = await keepAliveServer((path) => lengthReply(`hello ${path}`));
    const open = opener(port);
    const a = await fetchOverSocket("http://site.test/a", {}, open, "run");
    const b = await fetchOverSocket("http://site.test/b", {}, open, "run");
    expect(await a.text()).toBe("hello /a");
    expect(await b.text()).toBe("hello /b");
    expect(connections()).toBe(1);
  });

  test("chunked bodies end where the chunks say, so the connection can be reused", async () => {
    const { port, connections } = await keepAliveServer(() => chunkedReply(["he", "llo"]));
    const open = opener(port);
    expect(await (await fetchOverSocket("http://site.test/", {}, open, "run")).text()).toBe("hello");
    expect(await (await fetchOverSocket("http://site.test/", {}, open, "run")).text()).toBe("hello");
    expect(connections()).toBe(1);
  });

  test("without a reuse key every request opens its own connection", async () => {
    const { port, connections } = await keepAliveServer(() => lengthReply("x"));
    const open = opener(port);
    await fetchOverSocket("http://site.test/", {}, open);
    await fetchOverSocket("http://site.test/", {}, open);
    expect(connections()).toBe(2);
  });

  test("different reuse keys never share a connection", async () => {
    const { port, connections } = await keepAliveServer(() => lengthReply("x"));
    const open = opener(port);
    await fetchOverSocket("http://site.test/", {}, open, "proxy-a");
    await fetchOverSocket("http://site.test/", {}, open, "proxy-b");
    expect(connections()).toBe(2);
  });

  test("a server that says close is not reused", async () => {
    const { port, connections } = await keepAliveServer(() =>
      lengthReply("x", "Connection: close\r\n"),
    );
    const open = opener(port);
    await fetchOverSocket("http://site.test/", {}, open, "run");
    await fetchOverSocket("http://site.test/", {}, open, "run");
    expect(connections()).toBe(2);
  });

  test("a parked connection the server dropped is replaced transparently", async () => {
    const { port, connections } = await keepAliveServer(() => lengthReply("x"), {
      closeAfterEach: true,
    });
    const open = opener(port);
    await fetchOverSocket("http://site.test/", {}, open, "run");
    await Bun.sleep(20);
    const res = await fetchOverSocket("http://site.test/", {}, open, "run");
    expect(await res.text()).toBe("x");
    expect(connections()).toBe(2);
  });
});
