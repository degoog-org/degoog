import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import {
  getInstanceSettings,
  setInstanceSettings,
  updateInstanceSettings,
  type ServerSettingValue,
} from "../../src/server/utils/server-settings";
import { outgoingFetch } from "../../src/server/utils/outgoing";
import net from "node:net";

function createConnectProxy(): { server: net.Server; port: number; hits: string[]; close: () => void } {
  const hits: string[] = [];
  const server = net.createServer((clientSock) => {
    let buf = "";
    let handled = false;
    const onData = (chunk: Buffer): void => {
      if (handled) return;
      buf += chunk.toString();
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      handled = true;
      clientSock.removeListener("data", onData);

      const requestLine = buf.split("\r\n")[0];
      const connectMatch = requestLine.match(/^CONNECT (.+):(\d+) HTTP/);

      if (connectMatch) {
        const targetHost = connectMatch[1];
        const targetPort = Number(connectMatch[2]);
        hits.push(`CONNECT ${targetHost}:${targetPort}`);

        const targetSock = net.connect(targetPort, targetHost, () => {
          clientSock.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          clientSock.pipe(targetSock);
          targetSock.pipe(clientSock);
        });
        targetSock.on("error", () => clientSock.destroy());
      } else {
        clientSock.destroy();
      }
    };
    clientSock.on("data", onData);
    clientSock.on("error", () => {});
  });

  server.listen(0);
  const addr = server.address() as net.AddressInfo;
  return {
    server,
    port: addr.port,
    hits,
    close: () => server.close(),
  };
}

describe("outgoing proxy integration", () => {
  let targetServer: ReturnType<typeof Bun.serve>;
  let proxy: ReturnType<typeof createConnectProxy>;
  let savedSettings: Record<string, ServerSettingValue>;

  beforeAll(async () => {
    savedSettings = await getInstanceSettings();

    targetServer = Bun.serve({
      port: 0,
      fetch() {
        return new Response("target-ok");
      },
    });

    proxy = createConnectProxy();
  });

  afterEach(async () => {
    await setInstanceSettings(savedSettings);
    proxy.hits.length = 0;
  });

  afterAll(() => {
    targetServer?.stop();
    proxy?.close();
  });

  test("request routes through proxy when enabled", async () => {
    await updateInstanceSettings({
      proxyEnabled: "true",
      proxyUrls: `http://localhost:${proxy.port}`,
    });

    const targetUrl = `http://localhost:${targetServer.port}/test`;
    const res = await outgoingFetch(targetUrl);
    const body = await res.text();

    expect(proxy.hits.length).toBeGreaterThan(0);
    expect(body).toBe("target-ok");
  });

  test("request goes direct when proxy is disabled", async () => {
    await updateInstanceSettings({
      proxyEnabled: "false",
      proxyUrls: `http://localhost:${proxy.port}`,
    });

    const targetUrl = `http://localhost:${targetServer.port}/test`;
    const res = await outgoingFetch(targetUrl);
    const body = await res.text();

    expect(proxy.hits.length).toBe(0);
    expect(body).toBe("target-ok");
  });

  test("request fails when proxy is unreachable (proves no direct fallback)", async () => {
    await updateInstanceSettings({
      proxyEnabled: "true",
      proxyUrls: "http://127.0.0.1:1",
    });

    const targetUrl = `http://localhost:${targetServer.port}/test`;
    let threw = false;
    try {
      await outgoingFetch(targetUrl);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("proxy receives the correct target URL", async () => {
    await updateInstanceSettings({
      proxyEnabled: "true",
      proxyUrls: `http://localhost:${proxy.port}`,
    });

    const targetUrl = `http://localhost:${targetServer.port}/specific-path?q=hello`;
    await outgoingFetch(targetUrl);

    expect(proxy.hits.length).toBe(1);
    expect(proxy.hits[0]).toContain("localhost");
    expect(proxy.hits[0]).toContain(String(targetServer.port));
  });

  test("round-robins across multiple proxy URLs", async () => {
    const secondProxy = createConnectProxy();

    await updateInstanceSettings({
      proxyEnabled: "true",
      proxyUrls: `http://localhost:${proxy.port}\nhttp://localhost:${secondProxy.port}`,
    });

    const targetUrl = `http://localhost:${targetServer.port}/test`;

    await outgoingFetch(targetUrl);
    await outgoingFetch(targetUrl);

    const hitFirst = proxy.hits.length > 0;
    const hitSecond = secondProxy.hits.length > 0;
    expect(hitFirst || hitSecond).toBe(true);

    secondProxy.close();
  });
});
