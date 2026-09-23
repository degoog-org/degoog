import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { getServerKeyHex, initServerKey } from "../../src/server/utils/security/server-key";
import {
  getInstanceSettings,
  updateInstanceSettings,
  type ServerSettingValue,
} from "../../src/server/utils/settings/server-settings";

let searchRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

let _savedSettings: Record<string, ServerSettingValue> = {};

beforeAll(async () => {
  await initServerKey();
  const s = await getInstanceSettings();
  _savedSettings = {
    apiKeySearchEnabled: s.apiKeySearchEnabled ?? false,
  };
  await updateInstanceSettings({ apiKeySearchEnabled: false });
  const mod = await import("../../src/server/routes/search");
  searchRouter = mod.default;
});

afterAll(async () => {
  await updateInstanceSettings(_savedSettings);
});

describe("routes/search", () => {
  test("GET /api/search without q returns 400", async () => {
    const key = getServerKeyHex();
    if (!key) throw new Error("server key not loaded");
    const res = await searchRouter.request(
      new Request("http://localhost/api/search?google=true", {
        headers: { Authorization: `Bearer ${key}` },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("query");
  });

  test("GET /api/lucky without q returns 400", async () => {
    const res = await searchRouter.request("http://localhost/api/lucky");
    expect(res.status).toBe(400);
  });
});
