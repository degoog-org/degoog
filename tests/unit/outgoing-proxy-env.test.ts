import { describe, expect, test, afterEach } from "bun:test";
import {
  maskProxy,
  proxyEnv,
} from "../../src/server/utils/outgoing";

const savedEnv: Record<string, string | undefined> = {};

function setEnv(name: string, value: string | undefined): void {
  if (!(name in savedEnv)) savedEnv[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    delete savedEnv[name];
  }
});

describe("proxy env placeholders", () => {
  test("expands explicitly allowed environment placeholders", () => {
    setEnv("DEGOOG_PROXY_ENV_ALLOWLIST", "REPLIT_PROXY_SECRET");
    setEnv("REPLIT_PROXY_SECRET", "secret-pass");

    expect(
      proxyEnv("http://user:${REPLIT_PROXY_SECRET}@proxy:8080"),
    ).toBe("http://user:secret-pass@proxy:8080");
  });

  test("does not expand names that are not explicitly allowed", () => {
    setEnv("DEGOOG_PROXY_ENV_ALLOWLIST", "");
    setEnv("DEGOOG_SETTINGS_PASSWORDS", "admin-secret");

    expect(
      proxyEnv("http://user:${DEGOOG_SETTINGS_PASSWORDS}@proxy:8080"),
    ).toBe("http://user:${DEGOOG_SETTINGS_PASSWORDS}@proxy:8080");
  });

  test("keeps missing placeholders literal instead of silently emptying them", () => {
    setEnv("DEGOOG_PROXY_ENV_ALLOWLIST", "REPLIT_PROXY_SECRET");
    setEnv("REPLIT_PROXY_SECRET", undefined);

    expect(proxyEnv("${REPLIT_PROXY_SECRET}")).toBe(
      "${REPLIT_PROXY_SECRET}",
    );
  });

  test("supports explicit prefix allowlist", () => {
    setEnv("DEGOOG_PROXY_ENV_ALLOWLIST", "REPLIT_*");
    setEnv("REPLIT_PROXY_SECRET", "from-replit");

    expect(proxyEnv("${REPLIT_PROXY_SECRET}")).toBe(
      "from-replit",
    );
  });

  test("masks proxy credentials for logs", () => {
    expect(maskProxy("http://user:pass@proxy.example:8080")).toBe(
      "http://***:***@proxy.example:8080/",
    );
  });

  test("never leaks resolved credentials from a malformed proxy url", () => {
    process.env.DEGOOG_PROXY_ENV_ALLOWLIST = "REPLIT_*";
    process.env.REPLIT_PROXY_SECRET = "s3cr3t";
    const resolved = proxyEnv("http//user:${REPLIT_PROXY_SECRET}@proxy.example:8080");
    expect(resolved).toContain("s3cr3t");
    expect(maskProxy(resolved)).toBe("***");
  });
});
