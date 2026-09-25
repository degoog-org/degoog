import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ExtensionStoreType } from "../../src/server/types/extension";
import {
  INVALIDATE_SCOPE,
  type InvalidatePayload,
} from "../../src/server/utils/cache/cache-valkey";

const SPECS_MOD = "../../src/server/extensions/store/store-types";
const FACTORY_MOD = "../../src/server/extensions/registry-factory";

const specsReal = { ...(await import(SPECS_MOD)) };
const factoryReal = { ...(await import(FACTORY_MOD)) };

type SyncModule = typeof import("../../src/server/extensions/store/reload-sync");

let sync: SyncModule;
let reloads: { type: ExtensionStoreType; bust: boolean }[] = [];
let bumps = 0;
let closeBifrost: () => void = () => {};

const fakeSpecs = Object.fromEntries(
  Object.values(ExtensionStoreType).map((type) => [
    type,
    {
      ...specsReal.STORE_TYPE_SPECS[type],
      reload: async (bust: boolean) => {
        reloads.push({ type, bust });
      },
    },
  ]),
);

const peerEvent = (key: string): InvalidatePayload => ({
  scope: INVALIDATE_SCOPE.EXTENSIONS,
  key,
  origin: "another-worker",
});

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(async () => {
  mock.module(SPECS_MOD, () => ({ ...specsReal, STORE_TYPE_SPECS: fakeSpecs }));
  mock.module(FACTORY_MOD, () => ({
    ...factoryReal,
    bumpPluginRegistryReload: () => ++bumps,
  }));
  sync = await import("../../src/server/extensions/store/reload-sync");
  closeBifrost = sync.openBifrost();
});

afterAll(() => {
  closeBifrost();
  mock.module(SPECS_MOD, () => specsReal);
  mock.module(FACTORY_MOD, () => factoryReal);
});

beforeEach(() => {
  reloads = [];
  bumps = 0;
});

describe("store/reload-sync", () => {
  test("reloads locally once and ignores its own broadcast", async () => {
    await sync.reloadSync(ExtensionStoreType.Theme, sync.ReloadMode.Bump);
    await settle();

    expect(reloads).toEqual([{ type: ExtensionStoreType.Theme, bust: true }]);
    expect(bumps).toBe(1);
  });

  test("peer workers mirror a bumped reload", async () => {
    sync.heimdall(peerEvent("plugin:bump"));
    await settle();

    expect(reloads).toEqual([{ type: ExtensionStoreType.Plugin, bust: true }]);
    expect(bumps).toBe(1);
  });

  test("peer workers bust without bumping the generation", async () => {
    sync.heimdall(peerEvent("engine:bust"));
    await settle();

    expect(reloads).toEqual([{ type: ExtensionStoreType.Engine, bust: true }]);
    expect(bumps).toBe(0);
  });

  test("peer workers refresh without busting", async () => {
    sync.heimdall(peerEvent("shortcut:refresh"));
    await settle();

    expect(reloads).toEqual([{ type: ExtensionStoreType.Shortcut, bust: false }]);
  });

  test("ignores unknown types, modes and other scopes", async () => {
    sync.heimdall(peerEvent("widget:bump"));
    sync.heimdall(peerEvent("theme:explode"));
    sync.heimdall({ ...peerEvent("theme:bump"), scope: INVALIDATE_SCOPE.PLUGIN_SETTINGS });
    await settle();

    expect(reloads).toEqual([]);
  });

  test("round-trips reload keys", () => {
    const target = { type: ExtensionStoreType.Autocomplete, mode: sync.ReloadMode.Refresh };
    expect(sync.parseReloadKey(sync.toReloadKey(target))).toEqual(target);
    expect(sync.parseReloadKey(undefined)).toBeNull();
  });
});
