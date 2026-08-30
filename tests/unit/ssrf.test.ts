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

  test("blocks IPv4-mapped addresses written in hex", () => {
    for (const ip of [
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      "::ffff:c0a8:105",
      "::FFFF:0A00:0005",
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  test("blocks NAT64 addresses embedding a reserved IPv4", () => {
    for (const ip of [
      "64:ff9b::169.254.169.254",
      "64:ff9b::a9fe:a9fe",
      "64:ff9b::127.0.0.1",
      "64:ff9b:1::a9fe:a9fe",
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  test("blocks 6to4 addresses embedding a reserved IPv4", () => {
    for (const ip of ["2002:a9fe:a9fe::", "2002:7f00:1::1", "2002:c0a8:0101::"]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  test("blocks Teredo addresses embedding a reserved IPv4", () => {
    for (const ip of [
      "2001:0:a9fe:a9fe::",
      "2001:0:4136:e378:8000:63bf:5601:5e5e",
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  test("blocks IPv4-compatible addresses embedding a reserved IPv4", () => {
    for (const ip of ["::127.0.0.1", "::a9fe:a9fe"]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  test("blocks IPv4-translated addresses embedding a reserved IPv4", () => {
    for (const ip of ["::ffff:0:7f00:1", "::ffff:0:169.254.169.254"]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  test("blocks unassigned addresses in the lowest block", () => {
    for (const ip of ["::a:b:c:d", "::1234:5678:9abc"]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  test("allows transition addresses embedding a public IPv4", () => {
    for (const ip of [
      "::ffff:8.8.8.8",
      "::ffff:808:808",
      "64:ff9b::8.8.8.8",
      "64:ff9b::808:808",
      "2002:0808:0808::",
      "2001:4860:4860::8888",
      "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    ]) {
      expect(isBlockedIp(ip)).toBe(false);
    }
  });

  test("blocks site-local and other reserved IPv6 ranges", () => {
    for (const ip of ["fec0::1", "febf::1", "fdff::1", "ff02::1"]) {
      expect(isBlockedIp(ip)).toBe(true);
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

  test("rejects transition literals reaching the metadata service", async () => {
    expect(await isSafeHost("[64:ff9b::169.254.169.254]")).toBe(false);
    expect(await isSafeHost("[2002:a9fe:a9fe::]")).toBe(false);
    expect(await isSafeHost("[::ffff:a9fe:a9fe]")).toBe(false);
  });

  test("accepts a transition literal wrapping a public address", async () => {
    expect(await isSafeHost("[64:ff9b::8.8.8.8]")).toBe(true);
  });

  test("matches an allow-list IPv6 literal however it is spelled", async () => {
    const access = { enabled: true, patterns: ["fd12:3456:0:0:0:0:0:1"] };
    expect(await isSafeHost("fd12:3456::1", access)).toBe(true);
    expect(await isSafeHost("[FD12:3456::1]", access)).toBe(true);
    expect(await isSafeHost("fd12:3456::2", access)).toBe(false);
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
