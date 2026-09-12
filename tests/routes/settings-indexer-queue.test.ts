import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearServerSettingsCache,
  getInstanceSettings,
} from "../../src/server/utils/server-settings";

const QUEUE_MOD = "../../src/server/indexer/queue";

const queueReal = { ...(await import(QUEUE_MOD)) };

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
let startFails = false;

const saveField = (key: string, value: string) =>
  router.request(
    new Request("http://localhost/api/settings/field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    }),
  );

describe("POST /api/settings/field indexer queue", () => {
  beforeAll(async () => {
    for (const key of SAVED_ENV_KEYS) savedEnv.set(key, process.env[key]);
    tempDir = mkdtempSync(join(tmpdir(), "degoog-indexer-queue-"));
    process.env.DEGOOG_DATA_DIR = tempDir;
    process.env.DEGOOG_SERVER_SETTINGS_FILE = join(tempDir, "server-settings.json");
    delete process.env.DEGOOG_PUBLIC_INSTANCE;
    delete process.env.DEGOOG_SETTINGS_PASSWORDS;
    process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
    clearServerSettingsCache();

    mock.module(QUEUE_MOD, () => ({
      ...queueReal,
      startQueue: async () => {
        if (startFails) throw new Error("the queue refused to wake up");
      },
      stopQueue: async () => {},
    }));

    router = (await import("../../src/server/routes/settings")).default;
  });

  afterAll(() => {
    mock.module(QUEUE_MOD, () => queueReal);
    clearServerSettingsCache();
    rmSync(tempDir, { recursive: true, force: true });
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("flags a failed queue start while keeping the save", async () => {
    startFails = true;
    const res = await saveField("degoogIndexerEnabled", "true");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, indexerStartFailed: true });
    const settings = await getInstanceSettings();
    expect(settings.degoogIndexerEnabled).toBe(true);
  });

  test("stays quiet when the queue starts", async () => {
    startFails = false;
    const res = await saveField("degoogIndexerEnabled", "true");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("leaves unrelated settings untouched by the queue state", async () => {
    startFails = true;
    const res = await saveField("streamingEnabled", "true");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
