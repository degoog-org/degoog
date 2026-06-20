import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import setupRouter from "../../src/server/routes/setup";
import { clearServerSettingsCache } from "../../src/server/utils/server-settings";

let tempDir: string;
let savedDataDir: string | undefined;
let savedPublic: string | undefined;
let savedPasswords: string | undefined;
let savedDanger: string | undefined;

const restoreEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

beforeEach(() => {
  savedDataDir = process.env.DEGOOG_DATA_DIR;
  savedPublic = process.env.DEGOOG_PUBLIC_INSTANCE;
  savedPasswords = process.env.DEGOOG_SETTINGS_PASSWORDS;
  savedDanger = process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;

  tempDir = mkdtempSync(join(tmpdir(), "degoog-server-settings-"));
  process.env.DEGOOG_DATA_DIR = tempDir;
  delete process.env.DEGOOG_PUBLIC_INSTANCE;
  delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
  clearServerSettingsCache();
});

afterEach(() => {
  clearServerSettingsCache();
  rmSync(tempDir, { recursive: true, force: true });
  restoreEnv("DEGOOG_DATA_DIR", savedDataDir);
  restoreEnv("DEGOOG_PUBLIC_INSTANCE", savedPublic);
  restoreEnv("DEGOOG_SETTINGS_PASSWORDS", savedPasswords);
  restoreEnv("DEGOOG_DANGEROUSLY_NO_PASSWORD", savedDanger);
});

describe("routes/server-settings", () => {
  test("first-run wizard still runs on password-protected instances", async () => {
    process.env.DEGOOG_SETTINGS_PASSWORDS = "secret";

    const res = await setupRouter.request("http://localhost/api/server-settings");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ wizard: false });
  });

  test("first-run wizard is suppressed only for public instances", async () => {
    process.env.DEGOOG_PUBLIC_INSTANCE = "true";
    process.env.DEGOOG_SETTINGS_PASSWORDS = "secret";

    const res = await setupRouter.request("http://localhost/api/server-settings");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ wizard: true });
  });
});
