import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const tmpFile = join(tmpdir(), `degoog-blocklist-test-${Date.now()}.json`);
process.env.DEGOOG_BLOCKLIST_FILE = tmpFile;

import { checkBlocked, addEntry, removeEntry, listActive, resetCache } from "../../src/server/utils/blocklist";

const wipe = async (): Promise<void> => {
  try { await unlink(tmpFile); } catch {}
  resetCache();
};

beforeEach(wipe);
afterEach(wipe);

describe("checkBlocked", () => {
  test("missing file → not blocked", async () => {
    expect(await checkBlocked("1.2.3.4", 0)).toBe(false);
  });

  test("added ip → blocked", async () => {
    await addEntry("1.2.3.4");
    resetCache();
    expect(await checkBlocked("1.2.3.4", 0)).toBe(true);
  });

  test("different ip → not blocked", async () => {
    await addEntry("1.2.3.4");
    resetCache();
    expect(await checkBlocked("9.9.9.9", 0)).toBe(false);
  });

  test("banHours=0 → permanent, old entry still blocked", async () => {
    const ancient = new Date(Date.now() - 999 * 3_600_000).toISOString();
    await writeFile(tmpFile, JSON.stringify([{ ip: "1.2.3.4", time: ancient }]));
    resetCache();
    expect(await checkBlocked("1.2.3.4", 0)).toBe(true);
  });

  test("banHours=1, entry 2h old → expired, not blocked", async () => {
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await writeFile(tmpFile, JSON.stringify([{ ip: "1.2.3.4", time: old }]));
    resetCache();
    expect(await checkBlocked("1.2.3.4", 1)).toBe(false);
  });

  test("banHours=24, entry 1h old → still blocked", async () => {
    const recent = new Date(Date.now() - 3_600_000).toISOString();
    await writeFile(tmpFile, JSON.stringify([{ ip: "1.2.3.4", time: recent }]));
    resetCache();
    expect(await checkBlocked("1.2.3.4", 24)).toBe(true);
  });
});

describe("addEntry", () => {
  test("adds new ip with current timestamp", async () => {
    const before = Date.now();
    await addEntry("5.5.5.5");
    resetCache();
    const active = await listActive(0);
    expect(active).toHaveLength(1);
    expect(active[0].ip).toBe("5.5.5.5");
    expect(new Date(active[0].time).getTime()).toBeGreaterThanOrEqual(before);
  });

  test("re-adding existing ip refreshes timestamp so expired ban becomes active", async () => {
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await writeFile(tmpFile, JSON.stringify([{ ip: "1.2.3.4", time: old }]));
    resetCache();
    await addEntry("1.2.3.4");
    resetCache();
    expect(await checkBlocked("1.2.3.4", 1)).toBe(true);
  });
});

describe("removeEntry", () => {
  test("removes a blocked ip", async () => {
    await addEntry("1.2.3.4");
    resetCache();
    await removeEntry("1.2.3.4");
    resetCache();
    expect(await checkBlocked("1.2.3.4", 0)).toBe(false);
  });

  test("removing unknown ip is a no-op", async () => {
    await addEntry("1.2.3.4");
    resetCache();
    await removeEntry("9.9.9.9");
    resetCache();
    expect(await checkBlocked("1.2.3.4", 0)).toBe(true);
  });
});

describe("listActive", () => {
  test("returns only non-expired entries", async () => {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await writeFile(tmpFile, JSON.stringify([
      { ip: "1.1.1.1", time: old },
      { ip: "2.2.2.2", time: now },
    ]));
    resetCache();
    const active = await listActive(1);
    expect(active).toHaveLength(1);
    expect(active[0].ip).toBe("2.2.2.2");
  });

  test("banHours=0 returns all entries regardless of age", async () => {
    const ancient = new Date(Date.now() - 9999 * 3_600_000).toISOString();
    await writeFile(tmpFile, JSON.stringify([
      { ip: "1.1.1.1", time: ancient },
      { ip: "2.2.2.2", time: ancient },
    ]));
    resetCache();
    const active = await listActive(0);
    expect(active).toHaveLength(2);
  });

  test("expired entries are pruned from file", async () => {
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const now = new Date().toISOString();
    await writeFile(tmpFile, JSON.stringify([
      { ip: "1.1.1.1", time: old },
      { ip: "2.2.2.2", time: now },
    ]));
    resetCache();
    await listActive(1);
    resetCache();
    const remaining = await listActive(1);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].ip).toBe("2.2.2.2");
  });
});
