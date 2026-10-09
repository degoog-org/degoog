import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { CurlImpersonateTransport } from "../../src/server/extensions/transports/builtins/curl-impersonate";
import type { TransportContext } from "../../src/server/types/extension";

const transport = new CurlImpersonateTransport();
const hasBinary = transport.available();

const server = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const bytes = new Uint8Array(await req.arrayBuffer());
    return Response.json(
      {
        sha: createHash("sha256").update(bytes).digest("hex"),
        length: bytes.length,
        cookie: req.headers.get("cookie") ?? "",
        type: req.headers.get("content-type") ?? "",
      },
      { headers: { "Set-Cookie": "seen=1; Path=/" } },
    );
  },
});

afterAll(() => {
  server.stop(true);
});

const context = (): TransportContext => {
  const store = new Map<string, unknown>();
  return {
    fetch: (url, init) => fetch(url, init),
    useCache: <T,>() =>
      ({
        get: async (key: string) => (store.get(key) as T | undefined) ?? null,
        set: async (key: string, value: T) => {
          store.set(key, value);
        },
      }) as unknown as ReturnType<TransportContext["useCache"]>,
  } as TransportContext;
};

describe.skipIf(!hasBinary)("curl-impersonate binary bodies", () => {
  test("posts every byte untouched and still sends the cookies it holds", async () => {
    const ctx = context();
    const url = `http://127.0.0.1:${server.port}/upload`;
    await transport.fetch(url, {}, ctx);
    const body = new Uint8Array(4096).map((_, i) => (i * 7) % 256);
    const res = await transport.fetch(
      url,
      { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body },
      ctx,
    );
    const echoed = (await res.json()) as { sha: string; length: number; cookie: string; type: string };
    expect(echoed.length).toBe(body.length);
    expect(echoed.sha).toBe(createHash("sha256").update(body).digest("hex"));
    expect(echoed.cookie).toContain("seen=1");
    expect(echoed.type).toBe("application/octet-stream");
  });

  test("string bodies still go out as before", async () => {
    const res = await transport.fetch(
      `http://127.0.0.1:${server.port}/form`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "a=1&b=2" },
      context(),
    );
    const echoed = (await res.json()) as { length: number };
    expect(echoed.length).toBe(7);
  });
});
