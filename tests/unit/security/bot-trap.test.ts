import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const tmpFile = join(tmpdir(), `degoog-bot-trap-test-${Date.now()}.json`);
process.env.DEGOOG_BLOCKLIST_FILE = tmpFile;

import { blockIp } from "../../../src/server/utils/security/bot-trap";
import { checkBlocked, resetCache } from "../../../src/server/utils/filtering/blocklist";

const wipe = async (): Promise<void> => {
  try { await unlink(tmpFile); } catch {}
  resetCache();
};

beforeEach(wipe);
afterEach(wipe);

describe("blockIp - private/loopback addresses are never banned", () => {
  const privateAddrs = [
    "127.0.0.1",
    "127.0.0.2",
    "::1",
    "::ffff:127.0.0.1",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.28.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.1.100",
    "::ffff:10.0.0.1",
    "::ffff:172.28.0.1",
    "::ffff:192.168.1.1",
    "fd00::1",
    "fc00::1",
    "fe80::1",
  ];

  for (const addr of privateAddrs) {
    test(`does not ban ${addr}`, async () => {
      await blockIp(addr);
      resetCache();
      expect(await checkBlocked(addr, 0)).toBe(false);
    });
  }
});

describe("blockIp - public addresses are banned normally", () => {
  const publicAddrs = ["1.2.3.4", "8.8.8.8", "2001:db8::1"];

  for (const addr of publicAddrs) {
    test(`bans ${addr}`, async () => {
      await blockIp(addr);
      resetCache();
      expect(await checkBlocked(addr, 0)).toBe(true);
    });
  }
});
