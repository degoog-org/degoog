import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  clearServerSettingsCache,
  updateInstanceSettings,
} from "../../../src/server/utils/settings/server-settings";
import { clearRoster, rosterIdFor } from "../../../src/server/utils/net/proxy-roster";
import {
  benchedUntil,
  jerseyFor,
  strikeOut,
  ballparkFor,
} from "../../../src/server/utils/net/proxy-bench";
import { pickBatter } from "../../../src/server/utils/net/outgoing";

const ENV_KEYS = ["DEGOOG_DATA_DIR", "DEGOOG_SERVER_SETTINGS_FILE"] as const;

let dir: string;
let prev: Record<string, string | undefined>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "degoog-proxy-cooldown-"));
  prev = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(dir, "server-settings.json");
  clearServerSettingsCache();
  clearRoster();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (prev[key] === undefined) delete process.env[key];
    else process.env[key] = prev[key];
  }
  clearServerSettingsCache();
  clearRoster();
  rmSync(dir, { recursive: true, force: true });
});

const useProxies = (urls: string[], extra: Record<string, string> = {}) =>
  updateInstanceSettings({ proxyEnabled: "true", proxyUrls: urls.join("\n"), ...extra });

describe("proxy ids", () => {
  test("an id is random, stable for the same url and never derived from it", () => {
    const url = "socks5://user:secret@10.0.0.1:1080";
    const id = rosterIdFor(url);
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(rosterIdFor(url)).toBe(id);
    clearRoster();
    expect(rosterIdFor(url)).not.toBe(id);
  });

  test("a different username is a different proxy", () => {
    expect(rosterIdFor("http://alice:pw@10.0.0.2:8080")).not.toBe(
      rosterIdFor("http://bob:pw@10.0.0.2:8080"),
    );
  });

  test("nothing about a proxy is written to disk", async () => {
    await useProxies(["http://user:secret@10.0.0.3:8080"]);
    await pickBatter(undefined, "disk.test");
    expect(readdirSync(dir).filter((name) => name !== "server-settings.json")).toEqual([]);
  });
});

describe("sites", () => {
  test("every host is its own site unless the admin groups it", () => {
    expect(ballparkFor("www.example.com", [])).toBe("www.example.com");
    const groups = [["example.com", "example.co.uk"]];
    expect(ballparkFor("www.example.co.uk", groups)).toBe("example.com,example.co.uk");
    expect(ballparkFor("www.example.com", groups)).toBe("example.com,example.co.uk");
    expect(ballparkFor("notexample.com", groups)).toBe("notexample.com");
  });
});

describe("cooldown", () => {
  test("reordering the list keeps each proxy's id", async () => {
    await useProxies(["http://10.1.0.1:8080", "http://10.1.0.2:8080"]);
    const first = await pickBatter(undefined, "a.reorder.test");
    const second = await pickBatter(undefined, "a.reorder.test");
    await useProxies(["http://10.1.0.2:8080", "http://10.1.0.1:8080"]);
    const ids = new Map([
      [first!.url, first!.id],
      [second!.url, second!.id],
    ]);
    for (let i = 0; i < 2; i++) {
      const picked = await pickBatter(undefined, "a.reorder.test");
      expect(ids.get(picked!.url)).toBe(picked!.id);
    }
  });

  test("trouble resets the sessions and skips the proxy for that site only", async () => {
    await useProxies(["http://10.2.0.1:8080", "http://10.2.0.2:8080"]);
    const bad = (await pickBatter(undefined, "flagged.test"))!;
    const before = await jerseyFor(bad.id, "flagged.test");

    expect(await strikeOut(bad.id, "flagged.test", "captcha")).toBe(true);
    expect(await jerseyFor(bad.id, "flagged.test")).not.toBe(before);
    expect(await jerseyFor(bad.id, "other.test")).toBe(`${bad.id}.0`);
    expect(await benchedUntil(bad.id, "flagged.test")).toBeGreaterThan(Date.now());

    for (let i = 0; i < 4; i++) {
      expect((await pickBatter(undefined, "flagged.test"))!.id).not.toBe(bad.id);
    }
    const elsewhere = new Set<string>();
    for (let i = 0; i < 4; i++) elsewhere.add((await pickBatter(undefined, "other.test"))!.id);
    expect(elsewhere.has(bad.id)).toBe(true);
  });

  test("grouped hosts share the cooldown", async () => {
    await useProxies(["http://10.3.0.1:8080", "http://10.3.0.2:8080"], {
      proxyHostGroups: "group-a.test group-b.test",
    });
    const bad = (await pickBatter(undefined, "www.group-a.test"))!;
    await strikeOut(bad.id, "www.group-a.test", "rate_limited");
    expect(await benchedUntil(bad.id, "group-b.test")).toBeGreaterThan(0);
  });

  test("outcomes that are not triggers change nothing", async () => {
    await useProxies(["http://10.4.0.1:8080"], { proxyCooldownTriggers: "captcha" });
    const proxy = (await pickBatter(undefined, "quiet.test"))!;
    expect(await strikeOut(proxy.id, "quiet.test", "rate_limited")).toBe(false);
    expect(await strikeOut(proxy.id, "quiet.test", "ok")).toBe(false);
    expect(await jerseyFor(proxy.id, "quiet.test")).toBe(`${proxy.id}.0`);
    expect(await benchedUntil(proxy.id, "quiet.test")).toBe(0);
  });

  test("a zero cooldown still resets the sessions but keeps using the proxy", async () => {
    await useProxies(["http://10.5.0.1:8080"], { proxyCooldownMinutes: "0" });
    const proxy = (await pickBatter(undefined, "zero.test"))!;
    await strikeOut(proxy.id, "zero.test", "captcha");
    expect(await jerseyFor(proxy.id, "zero.test")).toBe(`${proxy.id}.1`);
    expect(await benchedUntil(proxy.id, "zero.test")).toBe(0);
  });

  test("a preferred proxy is kept unless it is cooling down for that site", async () => {
    await useProxies(["http://10.7.0.1:8080", "http://10.7.0.2:8080", "http://10.7.0.3:8080"]);
    const page1 = (await pickBatter(undefined, "pages.test"))!;
    for (let i = 0; i < 3; i++) {
      expect((await pickBatter(undefined, "pages.test", page1.id))!.id).toBe(page1.id);
    }
    await strikeOut(page1.id, "pages.test", "captcha");
    expect((await pickBatter(undefined, "pages.test", page1.id))!.id).not.toBe(page1.id);
  });

  test("a preferred proxy that was removed from the list is ignored", async () => {
    await useProxies(["http://10.8.0.1:8080"]);
    const gone = rosterIdFor("http://10.8.0.9:8080");
    expect((await pickBatter(undefined, "removed.test", gone))!.url).toBe("http://10.8.0.1:8080");
  });

  test("when every proxy is cooling down the one that frees up first is used", async () => {
    await useProxies(["http://10.6.0.1:8080", "http://10.6.0.2:8080"], {
      proxyCooldownMinutes: "5",
    });
    const first = (await pickBatter(undefined, "busy.test"))!;
    await strikeOut(first.id, "busy.test", "captcha");
    await updateInstanceSettings({ proxyCooldownMinutes: "30" });
    const second = (await pickBatter(undefined, "busy.test"))!;
    await strikeOut(second.id, "busy.test", "captcha");

    for (let i = 0; i < 3; i++) {
      expect((await pickBatter(undefined, "busy.test"))!.id).toBe(first.id);
    }
  });
});
