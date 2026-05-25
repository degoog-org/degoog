import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import {
  getInstanceSettings,
  setInstanceSettings,
  updateInstanceSettings,
  type ServerSettingValue,
} from "../../src/server/utils/server-settings";
import { clearRateLimitState } from "../../src/server/utils/rate-limit";

let savedSettings: Record<string, ServerSettingValue>;

describe("routes/rate-limit", () => {
  beforeAll(async () => {
    savedSettings = await getInstanceSettings();
  });

  afterEach(async () => {
    clearRateLimitState();
    await setInstanceSettings(savedSettings);
  });

  test("GET /api/rate-limit/test when rate limit disabled returns 200 with rateLimitEnabled false", async () => {
    await updateInstanceSettings({ rateLimitEnabled: "false" });
    const { default: router } = await import("../../src/server/routes/rate-limit");
    const res = await router.request(
      "http://localhost/api/rate-limit/test",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rateLimitEnabled?: boolean };
    expect(body.rateLimitEnabled).toBe(false);
  });

  test("GET /api/rate-limit/test when rate limit enabled returns 200 then 429 after burst exceeded", async () => {
    await updateInstanceSettings({
      rateLimitEnabled: "true",
      rateLimitBurstWindow: "20",
      rateLimitBurstMax: "3",
      rateLimitLongWindow: "600",
      rateLimitLongMax: "150",
    });
    const { default: router } = await import("../../src/server/routes/rate-limit");
    const baseUrl = "http://localhost/api/rate-limit/test";
    const req = (url: string) =>
      new Request(url, {
        headers: { "x-forwarded-for": "192.168.99.1" },
      });
    const r1 = await router.request(req(baseUrl));
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as { allowed?: boolean }).allowed).toBe(true);
    const r2 = await router.request(req(baseUrl));
    expect(r2.status).toBe(200);
    const r3 = await router.request(req(baseUrl));
    expect(r3.status).toBe(200);
    const r4 = await router.request(req(baseUrl));
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
