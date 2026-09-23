import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  INVALIDATE_SCOPE,
  type InvalidatePayload,
} from "../../src/server/utils/cache/cache-valkey";
import type { SettingValue } from "../../src/server/utils/settings/plugin-settings";

const RESOLVE_MOD = "../../src/server/extensions/resolve";
const SETTINGS_MOD = "../../src/server/utils/settings/plugin-settings";

const resolveReal = { ...(await import(RESOLVE_MOD)) };
const settingsReal = { ...(await import(SETTINGS_MOD)) };

type ExtSettings = Record<string, SettingValue>;

interface FakeTarget {
  priority?: number;
  configured: ExtSettings[];
  configure: (settings: ExtSettings) => void;
}

const makeTarget = (): FakeTarget => {
  const target: FakeTarget = {
    configured: [],
    configure: (settings) => {
      target.configured.push(settings);
    },
  };
  return target;
};

const STORED: Record<string, ExtSettings> = {};

let slot: FakeTarget;
let transport: FakeTarget;
let explodes = false;

type SyncModule = typeof import("../../src/server/extensions/settings-sync");
let sync: SyncModule;
let closePalantir: () => void = () => {};

const peerEvent = (key?: string): InvalidatePayload => ({
  scope: INVALIDATE_SCOPE.EXTENSION_SETTINGS,
  key,
  origin: "another-worker",
});

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(async () => {
  mock.module(RESOLVE_MOD, () => ({
    ...resolveReal,
    resolveExtension: (id: string) => ({
      engine: null,
      command: null,
      slot: id === "weather-slot" ? slot : null,
      interceptor: null,
      tab: null,
      transport:
        id === "proxy-transport"
          ? {
              ...transport,
              configure: (settings: ExtSettings) => {
                if (explodes) throw new Error("bad config");
                transport.configure(settings);
              },
            }
          : null,
      autocomplete: null,
    }),
  }));
  mock.module(SETTINGS_MOD, () => ({
    ...settingsReal,
    getSettings: async (id: string) => STORED[id] ?? {},
  }));
  sync = await import("../../src/server/extensions/settings-sync");
  closePalantir = sync.openPalantir();
});

afterAll(() => {
  closePalantir();
  mock.module(RESOLVE_MOD, () => resolveReal);
  mock.module(SETTINGS_MOD, () => settingsReal);
});

beforeEach(() => {
  slot = makeTarget();
  transport = makeTarget();
  explodes = false;
  for (const key of Object.keys(STORED)) delete STORED[key];
});

describe("extensions/settings-sync", () => {
  test("applies settings locally once and ignores its own broadcast", async () => {
    await sync.syncExtSettings("weather-slot", { city: "Rome", priority: "7" });
    await settle();

    expect(slot.configured).toEqual([{ city: "Rome", priority: "7" }]);
    expect(slot.priority).toBe(7);
  });

  test("peer workers re-apply the stored settings", async () => {
    STORED["weather-slot"] = { city: "Oslo", priority: "3" };

    sync.palantir(peerEvent("weather-slot"));
    await settle();

    expect(slot.configured).toEqual([{ city: "Oslo", priority: "3" }]);
    expect(slot.priority).toBe(3);
  });

  test("falls back to priority 0 when the stored priority is not a number", async () => {
    STORED["weather-slot"] = { priority: "soon" };

    sync.palantir(peerEvent("weather-slot"));
    await settle();

    expect(slot.priority).toBe(0);
  });

  test("ignores events without an id or from other scopes", async () => {
    STORED["weather-slot"] = { city: "Oslo" };

    sync.palantir(peerEvent(undefined));
    sync.palantir({ ...peerEvent("weather-slot"), scope: INVALIDATE_SCOPE.PLUGIN_SETTINGS });
    await settle();

    expect(slot.configured).toEqual([]);
  });

  test("a failing configure on a peer is logged instead of crashing", async () => {
    STORED["proxy-transport"] = { url: "nope" };
    explodes = true;

    expect(() => sync.palantir(peerEvent("proxy-transport"))).not.toThrow();
    await settle();

    expect(transport.configured).toEqual([]);
  });
});
