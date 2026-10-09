import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  clearServerSettingsCache,
  updateInstanceSettings,
} from "../../../src/server/utils/settings/server-settings";
import { clearRoster, rosterIdFor } from "../../../src/server/utils/net/proxy-roster";
import { DIRECT_EGRESS, jerseyFor, strikeOut } from "../../../src/server/utils/net/proxy-bench";
import { proxyScoreboard } from "../../../src/server/utils/net/proxy-scoreboard";

const ENV_KEYS = ["DEGOOG_DATA_DIR", "DEGOOG_SERVER_SETTINGS_FILE"] as const;
const FIRST = "socks5://user:secret@10.0.0.1:1080";
const SECOND = "http://other:pw@10.0.0.2:8080";

let dir: string;
let prev: Record<string, string | undefined>;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "degoog-proxy-scoreboard-"));
  prev = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(dir, "server-settings.json");
  clearServerSettingsCache();
  clearRoster();
  await updateInstanceSettings({ proxyEnabled: "true", proxyUrls: [FIRST, SECOND].join("\n") });
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

describe("proxy scoreboard", () => {
  test("the lineup shows positions and hosts, never credentials or ids", async () => {
    const lineup = await proxyScoreboard.lineup();
    expect(lineup.map((spot) => spot.label)).toEqual(["socks5://10.0.0.1:1080", "http://10.0.0.2:8080"]);
    expect(lineup.map((spot) => spot.position)).toEqual([1, 2]);
    const dump = JSON.stringify(lineup);
    expect(dump).not.toContain("secret");
    expect(dump).not.toContain("user");
    expect(dump).not.toContain(rosterIdFor(FIRST));
  });

  test("a struck out proxy shows the site it is benched on", async () => {
    await strikeOut(rosterIdFor(SECOND), "www.example.com", "captcha");
    const [first, second] = await proxyScoreboard.lineup();
    expect(first.benched).toEqual([]);
    expect(second.benched).toHaveLength(1);
    expect(second.benched[0]).toMatchObject({ site: "www.example.com", trigger: "captcha" });
    expect(second.benched[0].until).toBeGreaterThan(Date.now());
  });

  test("scouting an egress names its proxy and says when the jersey is stale", async () => {
    const id = rosterIdFor(FIRST);
    const egress = await jerseyFor(id, "www.example.com");
    const fresh = await proxyScoreboard.scout(egress, "www.example.com");
    expect(fresh).toMatchObject({ known: true, direct: false, position: 1, label: "socks5://10.0.0.1:1080", current: true, benchedUntil: 0 });

    await strikeOut(id, "www.example.com", "blocked");
    const stale = await proxyScoreboard.scout(egress, "www.example.com");
    expect(stale.current).toBe(false);
    expect(stale.benchedUntil).toBeGreaterThan(Date.now());
  });

  test("direct and unknown egresses are reported as such", async () => {
    expect(await proxyScoreboard.scout(DIRECT_EGRESS, "example.com")).toMatchObject({ direct: true, current: true });
    expect(await proxyScoreboard.scout("deadbeef.0", "example.com")).toMatchObject({ known: false, current: false });
  });
});
