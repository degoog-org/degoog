import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from "bun:test";
import { clearRateLimitState } from "../../src/server/rate-limit";

let rateLimitRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

let _savedLogger: string | undefined;

beforeAll(async () => {
  const mod = await import("../../src/server/routes/rate-limit");
  rateLimitRouter = mod.default;
});

beforeEach(() => {
  _savedLogger = process.env.LOGGER;
  process.env.LOGGER = "debug";
});

afterEach(() => {
  if (_savedLogger !== undefined) process.env.LOGGER = _savedLogger;
  else delete process.env.LOGGER;
});

describe("routes/rate-limit", () => {
  test("GET /api/rate-limit/test when rate limit disabled returns 200 with rateLimitEnabled false", async () => {
    mock.module("../../src/server/plugin-settings", () => ({
      getSettings: async () => ({}) as Record<string, string>,
    }));
    const res = await rateLimitRouter.request(
      "http://localhost/api/rate-limit/test",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rateLimitEnabled?: boolean };
    expect(body.rateLimitEnabled).toBe(false);
  });

  test("GET /api/rate-limit/test when rate limit enabled returns 200 then 429 after burst exceeded", async () => {
    mock.module("../../src/server/plugin-settings", () => ({
      getSettings: async () =>
        ({
          rateLimitEnabled: "true",
          rateLimitBurstWindow: "20",
          rateLimitBurstMax: "3",
          rateLimitLongWindow: "600",
          rateLimitLongMax: "150",
        }) as Record<string, string>,
    }));
    clearRateLimitState();
    const baseUrl = "http://localhost/api/rate-limit/test";
    const req = (url: string) =>
      new Request(url, {
        headers: { "x-forwarded-for": "192.168.99.1" },
      });
    const r1 = await rateLimitRouter.request(req(baseUrl));
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as { allowed?: boolean }).allowed).toBe(true);
    const r2 = await rateLimitRouter.request(req(baseUrl));
    expect(r2.status).toBe(200);
    const r3 = await rateLimitRouter.request(req(baseUrl));
    expect(r3.status).toBe(200);
    const r4 = await rateLimitRouter.request(req(baseUrl));
    expect(r4.status).toBe(429);
    expect(r4.headers.get("Retry-After")).toBeTruthy();
    const body429 = (await r4.json()) as {
      allowed?: boolean;
      retryAfterSec?: number;
    };
    expect(body429.allowed).toBe(false);
    expect(typeof body429.retryAfterSec).toBe("number");
    expect(body429.retryAfterSec).toBeGreaterThanOrEqual(1);
  });
});
