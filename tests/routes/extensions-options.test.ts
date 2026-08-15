import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  ExtensionStoreType,
  SlotPanelPosition,
  type ExtensionMeta,
  type SearchEngine,
  type SearchResultTab,
  type SlotPlugin,
} from "../../src/server/types";
import type { SettingValue } from "../../src/server/utils/plugin-settings";

const ENGINES_MOD = "../../src/server/extensions/engines/registry";
const SETTINGS_MOD = "../../src/server/utils/plugin-settings";
const TABS_MOD = "../../src/server/extensions/search-result-tabs/registry";
const SLOTS_MOD = "../../src/server/extensions/slots/registry";

const EXT_ID = "fake-options-engine";
const BARE_ID = "bare-options-engine";
const TAB_ID = "fake-options-tab";
const SLOT_ID = "fake-options-slot";
const url = (id: string, key: string): string =>
  `http://localhost/api/extensions/${id}/options/${key}`;

const SCHEMA = [
  { key: "baseUrl", label: "Base URL", type: "url" as const },
  { key: "apiKey", label: "API key", type: "password" as const, secret: true },
  {
    key: "model",
    label: "Model",
    type: "text" as const,
    optionsFrom: { dependsOn: ["baseUrl"], refreshLabel: "Fetch models" },
  },
  { key: "plain", label: "Plain", type: "text" as const },
];

const metaFor = (id: string): ExtensionMeta => ({
  id,
  displayName: "Fake options engine",
  description: "",
  type: ExtensionStoreType.Engine,
  configurable: true,
  settings: {},
  settingsSchema: SCHEMA,
});

let seenValues: Record<string, SettingValue> = {};
let seenSignal: unknown;
let hookBehaviour: "ok" | "throw" | "choose" | "badValue" = "ok";

const fakeEngine = {
  name: "fake",
  executeSearch: async () => [],
  getFieldOptions: async (
    key: string,
    values: Record<string, SettingValue>,
    signal?: AbortSignal,
  ) => {
    seenValues = values;
    seenSignal = signal;
    if (hookBehaviour === "throw") throw new Error("upstream down");
    if (hookBehaviour === "choose") {
      return { options: ["gemma3:e2b", "qwen3:8b"], value: "qwen3:8b" };
    }
    if (hookBehaviour === "badValue") {
      return { options: ["gemma3:e2b"], value: 42 };
    }
    return {
      options: [
        "gemma3:e2b",
        { value: "qwen3:8b", label: "Qwen 3 8B" },
        "gemma3:e2b",
        { value: "", label: "junk" },
        42,
      ],
      notice: `Detected 2 models for ${key}`,
    };
  },
} as unknown as SearchEngine;

const fakeTab = {
  id: TAB_ID,
  name: "Fake options tab",
  settingsId: TAB_ID,
  settingsSchema: SCHEMA,
  executeSearch: async () => ({ results: [] }),
  getFieldOptions: async () => ({
    options: [{ value: "tab-opt", label: "Tab option" }],
    notice: "from tab",
  }),
} as SearchResultTab;

const fakeSlot = {
  id: SLOT_ID,
  name: "Fake options slot",
  description: "",
  settingsId: SLOT_ID,
  position: SlotPanelPosition.AboveResults,
  trigger: () => false,
  execute: async () => ({ html: "" }),
  pluginManifest: {
    id: SLOT_ID,
    name: "Fake options manifest",
    settingsSchema: SCHEMA,
    getFieldOptions: async () => ({
      options: [{ value: "manifest-opt" }],
      notice: "from manifest",
    }),
  },
} as SlotPlugin;

const enginesReal = { ...(await import(ENGINES_MOD)) };
const settingsReal = { ...(await import(SETTINGS_MOD)) };
const tabsReal = { ...(await import(TABS_MOD)) };
const slotsReal = { ...(await import(SLOTS_MOD)) };

const SAVED_ENV_KEYS = [
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
] as const;

const savedEnv = new Map<string, string | undefined>();
let router: { request: (req: Request | string) => Response | Promise<Response> };

const post = (id: string, key: string, body: unknown): Promise<Response> =>
  Promise.resolve(
    router.request(
      new Request(url(id, key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );

describe("POST /api/extensions/:id/options/:key", () => {
  beforeAll(async () => {
    for (const key of SAVED_ENV_KEYS) savedEnv.set(key, process.env[key]);
    delete process.env.DEGOOG_PUBLIC_INSTANCE;
    delete process.env.DEGOOG_SETTINGS_PASSWORDS;
    process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";

    mock.module(ENGINES_MOD, () => ({
      ...enginesReal,
      getEngineExtensionMeta: async () => [metaFor(EXT_ID), metaFor(BARE_ID)],
      getEngineMap: () => ({ [EXT_ID]: fakeEngine }),
    }));
    mock.module(TABS_MOD, () => ({
      ...tabsReal,
      getSearchResultTabExtensionMeta: async () => [metaFor(TAB_ID)],
      getSearchResultTabs: () => [fakeTab],
      getSearchResultTabById: (id: string) => (id === TAB_ID ? fakeTab : null),
    }));
    mock.module(SLOTS_MOD, () => ({
      ...slotsReal,
      getSlotExtensionMeta: async () => [metaFor(SLOT_ID)],
      getSlotPlugins: () => [fakeSlot],
      getSlotPluginById: (id: string) => (id === SLOT_ID ? fakeSlot : null),
    }));
    mock.module(SETTINGS_MOD, () => ({
      ...settingsReal,
      getSettings: async () => ({ apiKey: "stored-secret", plain: "stored" }),
    }));

    router = (await import("../../src/server/routes/extensions")).default;
  });

  afterAll(() => {
    mock.module(ENGINES_MOD, () => enginesReal);
    mock.module(TABS_MOD, () => tabsReal);
    mock.module(SLOTS_MOD, () => slotsReal);
    mock.module(SETTINGS_MOD, () => settingsReal);
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("rejects unauthenticated callers", async () => {
    process.env.DEGOOG_SETTINGS_PASSWORDS = "hunter2";
    delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
    try {
      const res = await post(EXT_ID, "model", {});
      expect(res.status).toBe(401);
    } finally {
      delete process.env.DEGOOG_SETTINGS_PASSWORDS;
      process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
    }
  });

  test("rejects an unknown extension", async () => {
    const res = await post("nope-engine", "model", {});
    expect(res.status).toBe(404);
  });

  test("rejects a field that does not declare optionsFrom", async () => {
    const res = await post(EXT_ID, "plain", {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Field has no options source" });
  });

  test("rejects an extension with no getFieldOptions hook", async () => {
    const res = await post(BARE_ID, "model", {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Extension cannot list options" });
  });

  test("returns normalised options and the notice", async () => {
    hookBehaviour = "ok";
    const res = await post(EXT_ID, "model", { baseUrl: "http://localhost:11434" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      options: [{ value: "gemma3:e2b" }, { value: "qwen3:8b", label: "Qwen 3 8B" }],
      notice: "Detected 2 models for model",
      value: "",
    });
  });

  test("passes a chosen value back so the hook can fill the field", async () => {
    hookBehaviour = "choose";
    const res = await post(EXT_ID, "model", {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: string };
    expect(body.value).toBe("qwen3:8b");
    hookBehaviour = "ok";
  });

  test("drops a non-string chosen value", async () => {
    hookBehaviour = "badValue";
    const res = await post(EXT_ID, "model", {});
    const body = (await res.json()) as { value: string };
    expect(body.value).toBe("");
    hookBehaviour = "ok";
  });

  test("passes live values through and fills in unchanged secrets", async () => {
    hookBehaviour = "ok";
    await post(EXT_ID, "model", {
      baseUrl: "http://localhost:11434",
      notInSchema: "dropped",
    });
    expect(seenValues.baseUrl).toBe("http://localhost:11434");
    expect(seenValues.apiKey).toBe("stored-secret");
    expect(seenValues.notInSchema).toBeUndefined();
  });

  test("reports a failing hook as a bad gateway", async () => {
    hookBehaviour = "throw";
    const res = await post(EXT_ID, "model", {});
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Could not load options" });
    hookBehaviour = "ok";
  });

  test("passes an abort signal to the provider", async () => {
    hookBehaviour = "ok";
    seenSignal = undefined;
    await post(EXT_ID, "model", {});
    expect(seenSignal).toBeDefined();
    expect(
      typeof seenSignal === "object" &&
        seenSignal !== null &&
        "aborted" in seenSignal &&
        seenSignal.aborted === false,
    ).toBe(true);
  });

  test("resolves getFieldOptions from a search result tab", async () => {
    const res = await post(TAB_ID, "model", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      options: [{ value: "tab-opt", label: "Tab option" }],
      notice: "from tab",
      value: "",
    });
  });

  test("resolves getFieldOptions from a plugin manifest on a slot", async () => {
    const res = await post(SLOT_ID, "model", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      options: [{ value: "manifest-opt" }],
      notice: "from manifest",
      value: "",
    });
  });
});
