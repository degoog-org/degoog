import { describe, test, expect } from "bun:test";
import {
  canBalrogPass,
  hasGeneratedDefaultSettingsPassword,
  isDangerouslyNoPassword,
  isPasswordRequired,
} from "../../src/server/routes/settings/settings-auth";

const ctx = (url: string, headers: Record<string, string> = {}) => {
  const req = new Request(url, { headers });
  return {
    req: Object.assign(req, {
      header: (name: string) => req.headers.get(name) ?? undefined,
      query: (name: string) =>
        new URL(req.url).searchParams.get(name) ?? undefined,
    }),
  } as unknown as Parameters<typeof canBalrogPass>[0];
};

describe("routes/settings-auth", () => {
  test("canBalrogPass returns undefined when no cookie or header", () => {
    expect(canBalrogPass(ctx("http://localhost/"))).toBeUndefined();
  });

  test("canBalrogPass ignores a token supplied via query param", () => {
    expect(
      canBalrogPass(ctx("http://localhost/?token=leaked-admin-token")),
    ).toBeUndefined();
  });

  test("canBalrogPass reads the token from the x-settings-token header", () => {
    expect(
      canBalrogPass(
        ctx("http://localhost/", { "x-settings-token": "header-token" }),
      ),
    ).toBe("header-token");
  });

  test("requires a generated default password when no password env is set", () => {
    const oldPasswords = process.env.DEGOOG_SETTINGS_PASSWORDS;
    const oldDanger = process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
    delete process.env.DEGOOG_SETTINGS_PASSWORDS;
    delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
    try {
      expect(isDangerouslyNoPassword()).toBe(false);
      expect(hasGeneratedDefaultSettingsPassword()).toBe(true);
      expect(isPasswordRequired()).toBe(true);
    } finally {
      if (oldPasswords === undefined) delete process.env.DEGOOG_SETTINGS_PASSWORDS;
      else process.env.DEGOOG_SETTINGS_PASSWORDS = oldPasswords;
      if (oldDanger === undefined) delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
      else process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = oldDanger;
    }
  });

  test("allows explicitly disabling settings auth with the dangerous no-password env", () => {
    const oldPasswords = process.env.DEGOOG_SETTINGS_PASSWORDS;
    const oldDanger = process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
    delete process.env.DEGOOG_SETTINGS_PASSWORDS;
    process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
    try {
      expect(isDangerouslyNoPassword()).toBe(true);
      expect(hasGeneratedDefaultSettingsPassword()).toBe(false);
      expect(isPasswordRequired()).toBe(false);
    } finally {
      if (oldPasswords === undefined) delete process.env.DEGOOG_SETTINGS_PASSWORDS;
      else process.env.DEGOOG_SETTINGS_PASSWORDS = oldPasswords;
      if (oldDanger === undefined) delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
      else process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = oldDanger;
    }
  });

});
