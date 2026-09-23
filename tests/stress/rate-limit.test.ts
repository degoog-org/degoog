import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import {
  getInstanceSettings,
  setInstanceSettings,
  updateInstanceSettings,
  type ServerSettingValue,
} from "../../src/server/utils/settings/server-settings";
import { clearRateLimitState } from "../../src/server/utils/security/rate-limit";

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

});
