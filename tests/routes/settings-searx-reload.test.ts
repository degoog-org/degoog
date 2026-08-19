import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearServerSettingsCache } from "../../src/server/utils/server-settings";

const ENGINES_MOD = "../../src/server/extensions/engines/registry";

const enginesReal = { ...(await import(ENGINES_MOD)) };

const SAVED_ENV_KEYS = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
] as const;

const savedEnv = new Map<string, string | undefined>();

let tempDir: string;
let router: { request: (req: Request | string) => Response | Promise<Response> };
let reloadFails = false;

const saveField = (key: string, value: string) =>
  router.request(
    new Request("http://localhost/api/settings/field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    }),
  );

describe("POST /api/settings/field searx reload", () => {
  beforeAll(async () => {
    for (const key of SAVED_ENV_KEYS) savedEnv.set(key, process.env[key]);
    tempDir = mkdtempSync(join(tmpdir(), "degoog-searx-reload-"));
    process.env.DEGOOG_DATA_DIR = tempDir;
    process.env.DEGOOG_SERVER_SETTINGS_FILE = join(tempDir, "server-settings.json");
    delete process.env.DEGOOG_PUBLIC_INSTANCE;
    delete process.env.DEGOOG_SETTINGS_PASSWORDS;
    process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
    clearServerSettingsCache();

    mock.module(ENGINES_MOD, () => ({
      ...enginesReal,
      reloadEngines: async () => {
        if (reloadFails) throw new Error("python went for a walk");
      },
    }));

    router = (await import("../../src/server/routes/settings")).default;
  });

  afterAll(() => {
    mock.module(ENGINES_MOD, () => enginesReal);
    clearServerSettingsCache();
    rmSync(tempDir, { recursive: true, force: true });
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("reports a failed reload while keeping the save", async () => {
    reloadFails = true;
    const res = await saveField("searxCompatEnabled", "true");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, searxReloadFailed: true });
  });

  test("stays quiet when the reload works", async () => {
    reloadFails = false;
    const res = await saveField("searxCompatEnabled", "false");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("leaves unrelated settings untouched by the reload state", async () => {
    reloadFails = true;
    const res = await saveField("streamingEnabled", "true");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
