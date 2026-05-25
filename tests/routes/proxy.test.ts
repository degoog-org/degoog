import { describe, test, expect, beforeAll } from "bun:test";

let proxyRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  const { initServerKey } = await import("../../src/server/utils/server-key");
  await initServerKey();
  const mod = await import("../../src/server/routes/proxy");
  proxyRouter = mod.default;
});

describe("routes/proxy", () => {
  test("GET /api/proxy/image without url returns 400", async () => {
    const res = await proxyRouter.request("http://localhost/api/proxy/image");
    expect(res.status).toBe(400);
  });

  test("GET /api/proxy/image with invalid url returns 400", async () => {
    const res = await proxyRouter.request(
      "http://localhost/api/proxy/image?url=not-a-valid-url",
    );
    expect(res.status).toBe(400);
  });

  test("signed URL to a private IP is blocked", async () => {
    const { buildSignedProxyUrl } = await import(
      "../../src/server/utils/proxy-sign"
    );
    const signed = buildSignedProxyUrl("http://127.0.0.1:8080/x.png");
    const res = await proxyRouter.request(`http://localhost${signed}`);
    expect(res.status).toBe(502);
  });
});
