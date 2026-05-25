import { describe, test, expect } from "bun:test";
import { isBlockedIp, isSafeHost } from "../../src/server/utils/ssrf";

describe("ssrf isBlockedIp", () => {
  test("blocks loopback, private, link-local, unspecified", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.3.4",
      "192.168.1.1",
      "169.254.10.10",
      "0.0.0.0",
      "100.64.0.1",
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  test("blocks IPv6 loopback, link-local, unique-local, mapped", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  test("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.114.1"]) {
      expect(isBlockedIp(ip)).toBe(false);
    }
  });
});

describe("ssrf isSafeHost", () => {
  test("rejects private IP literals", async () => {
    expect(await isSafeHost("127.0.0.1")).toBe(false);
    expect(await isSafeHost("[::1]")).toBe(false);
  });

  test("accepts public IP literal", async () => {
    expect(await isSafeHost("8.8.8.8")).toBe(true);
  });

  test("allows every local address when enabled with no patterns", async () => {
    const access = { enabled: true, patterns: [] };
    expect(await isSafeHost("192.168.1.5", access)).toBe(true);
    expect(await isSafeHost("10.0.0.9", access)).toBe(true);
  });

  test("restricts local access to matching regex patterns", async () => {
    const access = { enabled: true, patterns: ["^192\\.168\\."] };
    expect(await isSafeHost("192.168.1.5", access)).toBe(true);
    expect(await isSafeHost("10.0.0.9", access)).toBe(false);
  });

  test("matches a full IP literally without loose regex dots", async () => {
    const access = { enabled: true, patterns: ["192.168.1.5"] };
    expect(await isSafeHost("192.168.1.5", access)).toBe(true);
    expect(await isSafeHost("192.168.1.50", access)).toBe(false);
  });

  test("ignores patterns when disabled", async () => {
    expect(
      await isSafeHost("192.168.1.5", { enabled: false, patterns: ["^192\\."] }),
    ).toBe(false);
  });
});
