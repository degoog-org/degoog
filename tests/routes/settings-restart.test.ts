import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SHARED = join(tmpdir(), "degoog-settings-restart-tests");
mkdirSync(SHARED, { recursive: true });
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(SHARED, "server-settings.json");
process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(SHARED, "plugin-settings.json");

import router from "../../src/server/routes/settings";
import {
  clearRestartPending,
  markRestartPending,
} from "../../src/server/utils/restart-state";

let savedDangerouslyNoPassword: string | undefined;

const get = (path: string): Promise<Response> =>
  Promise.resolve(router.request(`http://localhost${path}`));

describe("settings restart routes", () => {
  beforeAll(() => {
    savedDangerouslyNoPassword = process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
    delete process.env.DEGOOG_PUBLIC_INSTANCE;
    delete process.env.DEGOOG_SETTINGS_PASSWORDS;
    process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
  });

  afterAll(() => {
    if (savedDangerouslyNoPassword !== undefined) {
      process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = savedDangerouslyNoPassword;
    } else {
      delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
    }
  });

  beforeEach(() => {
    clearRestartPending();
  });

  afterEach(() => {
    clearRestartPending();
  });

  test("GET restart-state reports no restart pending by default", async () => {
    const res = await get("/api/settings/restart-state");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pending: false, reasons: [] });
  });

  test("GET restart-state reflects a pending restart and its reasons", async () => {
    markRestartPending('transport "acme" was installed');
    const res = await get("/api/settings/restart-state");
    const body = await res.json();
    expect(body.pending).toBe(true);
    expect(body.reasons).toContain('transport "acme" was installed');
  });
});
