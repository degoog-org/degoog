import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import setupRouter from "../../src/server/routes/setup";
import { clearServerSettingsCache } from "../../src/server/utils/settings/server-settings";

let tempDir: string;
let savedDataDir: string | undefined;
let savedSettingsFile: string | undefined;
let savedPublic: string | undefined;
let savedPasswords: string | undefined;
let savedDanger: string | undefined;
let savedWizard: string | undefined;

const restoreEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

beforeEach(() => {
  savedDataDir = process.env.DEGOOG_DATA_DIR;
  savedSettingsFile = process.env.DEGOOG_SERVER_SETTINGS_FILE;
  savedPublic = process.env.DEGOOG_PUBLIC_INSTANCE;
  savedPasswords = process.env.DEGOOG_SETTINGS_PASSWORDS;
  savedDanger = process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
  savedWizard = process.env.DEGOOG_WIZARD;

  tempDir = mkdtempSync(join(tmpdir(), "degoog-server-settings-"));
  process.env.DEGOOG_DATA_DIR = tempDir;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(tempDir, "server-settings.json");
  delete process.env.DEGOOG_PUBLIC_INSTANCE;
  delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
  delete process.env.DEGOOG_WIZARD;
  clearServerSettingsCache();
});

afterEach(() => {
  clearServerSettingsCache();
  rmSync(tempDir, { recursive: true, force: true });
  restoreEnv("DEGOOG_DATA_DIR", savedDataDir);
  restoreEnv("DEGOOG_SERVER_SETTINGS_FILE", savedSettingsFile);
  restoreEnv("DEGOOG_PUBLIC_INSTANCE", savedPublic);
  restoreEnv("DEGOOG_SETTINGS_PASSWORDS", savedPasswords);
  restoreEnv("DEGOOG_DANGEROUSLY_NO_PASSWORD", savedDanger);
  restoreEnv("DEGOOG_WIZARD", savedWizard);
});

describe("routes/server-settings", () => {
  test.each(["false", "FALSE"])("DEGOOG_WIZARD=%s disables the wizard entirely", async (value) => {
    process.env.DEGOOG_WIZARD = value;
    process.env.DEGOOG_SETTINGS_PASSWORDS = "secret";

    const res = await setupRouter.request("http://localhost/api/server-settings");
    expect(await res.json()).toEqual({ wizard: true, disabled: true });
  });

  test.each(["true", "0", ""])("DEGOOG_WIZARD=%s leaves the persisted state in charge", async (value) => {
    process.env.DEGOOG_WIZARD = value;
    process.env.DEGOOG_SETTINGS_PASSWORDS = "secret";

    const res = await setupRouter.request("http://localhost/api/server-settings");
    expect(await res.json()).toEqual({ wizard: false });
  });

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
