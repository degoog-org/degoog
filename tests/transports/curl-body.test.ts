import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { fetchViaCurl } from "../../src/server/extensions/transports/builtins/curl/curl-fetch";

const server = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const bytes = new Uint8Array(await req.arrayBuffer());
    return Response.json({
      sha: createHash("sha256").update(bytes).digest("hex"),
      length: bytes.length,
      type: req.headers.get("content-type") ?? "",
    });
  },
});

const url = `http://127.0.0.1:${server.port}/upload`;

afterAll(() => {
  server.stop(true);
});

describe("curl transport bodies", () => {
  test("posts every byte of a binary body untouched", async () => {
    const body = new Uint8Array(4096).map((_, i) => (i * 7) % 256);
    const res = await fetchViaCurl(url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body,
    });
    const echoed = JSON.parse(await res.text()) as { sha: string; length: number; type: string };
    expect(echoed.length).toBe(body.length);
    expect(echoed.sha).toBe(createHash("sha256").update(body).digest("hex"));
    expect(echoed.type).toBe("application/octet-stream");
  });

  test("posts string bodies as sent", async () => {
    const res = await fetchViaCurl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "a=1&b=2",
    });
    const echoed = JSON.parse(await res.text()) as { length: number; type: string };
    expect(echoed.length).toBe(7);
    expect(echoed.type).toBe("application/x-www-form-urlencoded");
  });
});
