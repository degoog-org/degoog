import { describe, test, expect, beforeAll } from "bun:test";
import { getServerKeyHex, initServerKey } from "../../src/server/utils/security/server-key";
import { clear as clearServerCache } from "../../src/server/utils/cache/cache";

let suggestRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  await initServerKey();
  const mod = await import("../../src/server/routes/suggest");
  suggestRouter = mod.default;
});

const _authHeaders = (): Record<string, string> => {
  const key = getServerKeyHex();
  if (!key) throw new Error("server key not loaded");
  return { Authorization: `Bearer ${key}` };
};

describe("routes/suggest", () => {
  test("GET /api/suggest/opensearch returns 200 and [query, suggestions]", async () => {
    clearServerCache();
    const res = await suggestRouter.request(
      new Request("http://localhost/api/suggest/opensearch?q=foo", {
        headers: _authHeaders(),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain(
      "application/x-suggestions",
    );
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0]).toBe("foo");
  });
});
