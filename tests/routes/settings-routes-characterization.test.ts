import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { OVERSIZED_FIELDS_KEY } from "../../src/shared/indexer";

const ISOLATED_ENV = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_PLUGIN_SETTINGS_FILE",
  "DEGOOG_SEARCH_LISTS_FILE",
  "DEGOOG_INDEXER_DIR",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
] as const;

type Router = { request: (req: Request | string) => Response | Promise<Response> };

let router: Router;
let settings: typeof import("../../src/server/utils/settings/server-settings");
let domainLists: typeof import("../../src/server/utils/filtering/domain-lists");
let tempDir = "";
const savedEnv: Record<string, string | undefined> = {};

const get = (path: string, headers?: Record<string, string>): Promise<Response> =>
  Promise.resolve(router.request(new Request(`http://localhost${path}`, { headers })));

const send = (
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> =>
  Promise.resolve(
    router.request(
      new Request(`http://localhost${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    ),
  );

const post = (path: string, body: unknown, headers?: Record<string, string>) =>
  send("POST", path, body, headers);

beforeAll(async () => {
  for (const key of ISOLATED_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  tempDir = mkdtempSync(join(tmpdir(), "degoog-settings-routes-"));
  process.env.DEGOOG_DATA_DIR = tempDir;
  process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";

  router = (await import("../../src/server/routes/settings")).default;
  settings = await import("../../src/server/utils/settings/server-settings");
  domainLists = await import("../../src/server/utils/filtering/domain-lists");
});

afterAll(() => {
  for (const key of ISOLATED_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await settings.setInstanceSettings({});
  settings.clearServerSettingsCache();
});

describe("GET /api/settings/streaming reports the streaming shape", () => {
  test("absent settings collapse to defaults", async () => {
    const body = await (await get("/api/settings/streaming")).json();
    expect(body).toEqual({
      enabled: false,
      autoRetry: false,
      maxRetries: 2,
      disabledTypes: [],
      infiniteScroll: false,
    });
  });

  test("disabled types are split, trimmed and emptied out", async () => {
    await settings.updateInstanceSettings({
      streamingEnabled: true,
      streamingMaxRetries: "5",
      streamingDisabledTypes: " images \n\n videos \n",
    });
    settings.clearServerSettingsCache();

    const body = await (await get("/api/settings/streaming")).json();
    expect(body.enabled).toBe(true);
    expect(body.maxRetries).toBe(5);
    expect(body.disabledTypes).toEqual(["images", "videos"]);
  });
});

describe("GET /api/settings/languages", () => {
  test("a disabled language list falls back to the defaults", async () => {
    const body = await (await get("/api/settings/languages")).json();
    expect(Array.isArray(body.languages)).toBe(true);
    expect(body.languages.length).toBeGreaterThan(0);
    expect(body.languages).toMatchSnapshot();
  });

  test("an enabled list keeps only two and three letter codes", async () => {
    await settings.updateInstanceSettings({
      languagesEnabled: true,
      languages: "EN, fr\nde\nnope!\nspa\nx",
    });
    settings.clearServerSettingsCache();

    const body = await (await get("/api/settings/languages")).json();
    expect(body.languages).toEqual(["en", "fr", "de", "spa"]);
  });

  test("an enabled list with nothing usable falls back to the defaults", async () => {
    await settings.updateInstanceSettings({
      languagesEnabled: true,
      languages: "!!!, 1234",
    });
    settings.clearServerSettingsCache();

    const body = await (await get("/api/settings/languages")).json();
    expect(body.languages.length).toBeGreaterThan(1);
  });
});

describe("POST /api/settings/field", () => {
  test("an unknown key is refused", async () => {
    const res = await post("/api/settings/field", { key: "nope", value: "x" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown setting" });
  });

  test("a non-string value is refused", async () => {
    const res = await post("/api/settings/field", {
      key: "streamingEnabled",
      value: 5,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid value" });
  });

  test("a malformed body is refused before anything is written", async () => {
    const res = await post("/api/settings/field", "{ not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  test("a known boolean key is coerced and stored", async () => {
    const res = await post("/api/settings/field", {
      key: "streamingEnabled",
      value: "true",
    });
    expect(res.status).toBe(200);
    settings.clearServerSettingsCache();
    expect((await settings.getInstanceSettings()).streamingEnabled).toBe(true);
  });
});

describe("POST /api/settings/domain-action hostname handling", () => {
  beforeEach(async () => {
    await settings.updateInstanceSettings({
      domainBlockUiEnabled: true,
      domainReplaceUiEnabled: true,
      domainScoreUiEnabled: true,
    });
    settings.clearServerSettingsCache();
    await domainLists.writeDomainList("domainBlockList", "");
    await domainLists.writeDomainList("domainReplaceList", "");
    await domainLists.writeDomainList("domainScoreList", "");
  });

  test("a scheme, path and casing are all stripped from the source", async () => {
    const res = await post("/api/settings/domain-action", {
      kind: "block",
      source: "  HTTPS://Example.COM/some/path?q=1  ",
    });
    expect(res.status).toBe(200);
    expect((await domainLists.readDomainLists()).domainBlockList).toBe(
      "example.com",
    );
  });

  test("an empty source is refused", async () => {
    const res = await post("/api/settings/domain-action", {
      kind: "block",
      source: "   ",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing source" });
  });

  test("an unknown kind is refused", async () => {
    const res = await post("/api/settings/domain-action", {
      kind: "explode",
      source: "example.com",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid kind" });
  });

  test("blocking the same domain twice does not duplicate it", async () => {
    await post("/api/settings/domain-action", { kind: "block", source: "a.com" });
    await post("/api/settings/domain-action", { kind: "block", source: "a.com" });
    expect((await domainLists.readDomainLists()).domainBlockList).toBe("a.com");
  });

  test("a replacement for the same source overwrites the previous target", async () => {
    await post("/api/settings/domain-action", {
      kind: "replace",
      source: "a.com",
      target: "b.com",
    });
    await post("/api/settings/domain-action", {
      kind: "replace",
      source: "a.com",
      target: "c.com",
    });
    expect((await domainLists.readDomainLists()).domainReplaceList).toBe(
      "a.com -> c.com",
    );
  });

  test("a replacement without a target is refused", async () => {
    const res = await post("/api/settings/domain-action", {
      kind: "replace",
      source: "a.com",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing target" });
  });

  test("a score is truncated and upserted", async () => {
    await post("/api/settings/domain-action", {
      kind: "score",
      source: "a.com",
      score: 3.9,
    });
    await post("/api/settings/domain-action", {
      kind: "score",
      source: "a.com",
      score: -1.2,
    });
    expect((await domainLists.readDomainLists()).domainScoreList).toBe("a.com|-1");
  });

  test("a non-numeric score is refused", async () => {
    const res = await post("/api/settings/domain-action", {
      kind: "score",
      source: "a.com",
      score: "banana",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid score" });
  });
});

describe("POST /api/settings/domain-action respects each ui toggle", () => {
  test.each([
    ["block", { kind: "block", source: "a.com" }],
    ["replace", { kind: "replace", source: "a.com", target: "b.com" }],
    ["score", { kind: "score", source: "a.com", score: 1 }],
  ])("%s is forbidden while its ui toggle is off", async (_label, body) => {
    await settings.setInstanceSettings({});
    settings.clearServerSettingsCache();

    const res = await post("/api/settings/domain-action", body);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

describe("api key routes refuse before they authenticate", () => {
  test("GET is forbidden when no password is configured", async () => {
    const res = await get("/api/settings/api-key");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  test("regenerate is forbidden when no password is configured", async () => {
    const res = await post("/api/settings/api-key/regenerate", {});
    expect(res.status).toBe(403);
  });
});

describe("appearance, tab order and default engines", () => {
  test("appearance falls back to system", async () => {
    expect(await (await get("/api/settings/appearance")).json()).toEqual({
      theme: "system",
    });
  });

  test("appearance reports the configured default theme", async () => {
    await settings.updateInstanceSettings({ defaultTheme: "dark" });
    settings.clearServerSettingsCache();
    expect(await (await get("/api/settings/appearance")).json()).toEqual({
      theme: "dark",
    });
  });

  test("an absent tab order reads as an empty array", async () => {
    expect(await (await get("/api/settings/tab-order")).json()).toEqual({
      engineTabsOrder: [],
    });
  });

  test("a posted tab order round-trips", async () => {
    const res = await post("/api/settings/tab-order", {
      engineTabsOrder: ["web", "images"],
    });
    expect(res.status).toBe(200);
    settings.clearServerSettingsCache();
    expect(await (await get("/api/settings/tab-order")).json()).toEqual({
      engineTabsOrder: ["web", "images"],
    });
  });

  test("a tab order that is not an array is refused", async () => {
    const res = await post("/api/settings/tab-order", { engineTabsOrder: "web" });
    expect(res.status).toBe(400);
  });

  test("default engines round-trip", async () => {
    const res = await post("/api/settings/default-engines", {
      defaults: { "acme-engine": true },
    });
    expect(res.status).toBe(200);
    const body = await (await get("/api/settings/default-engines")).json();
    expect(body).toMatchSnapshot();
  });
});

describe("shortcut scaffold and restart state", () => {
  test("the scaffold is a module source string", async () => {
    const body = await (await get("/api/settings/shortcuts/scaffold")).json();
    expect(typeof body.source).toBe("string");
    expect(body.source).toContain("export default");
  });

  test("restart state reports a shape the client can read", async () => {
    const res = await get("/api/settings/restart-state");
    expect(res.status).toBe(200);
    expect(typeof (await res.json())).toBe("object");
  });
});

describe("GET /api/settings/general hides oversized list fields", () => {
  test("a very large list field is blanked and summarised", async () => {
    const huge = Array.from({ length: 6000 }, (_u, i) => `host-${i}.example.test`).join("\n");
    await domainLists.writeDomainList("domainBlockList", huge);
    settings.clearServerSettingsCache();

    const body = await (await get("/api/settings/general")).json();
    expect(body.domainBlockList).toBe("");
    const oversized = body[OVERSIZED_FIELDS_KEY];
    expect(oversized).toBeDefined();
    expect(Object.keys(oversized)).toContain("domainBlockList");
    expect(oversized.domainBlockList.lines).toBe(6000);
    expect(oversized.domainBlockList.chars).toBe(huge.length);
  });

  test("a small list field is returned inline", async () => {
    await domainLists.writeDomainList("domainBlockList", "a.com\nb.com");
    settings.clearServerSettingsCache();

    const body = await (await get("/api/settings/general")).json();
    expect(body.domainBlockList).toBe("a.com\nb.com");
  });
});

describe("honeypot blocklist routes", () => {
  test("banning then listing shows the entry, unbanning removes it", async () => {
    const banned = await post("/api/settings/honeypot/ban", { ip: " 203.0.113.7 " });
    expect(banned.status).toBe(200);

    const listed = await (await get("/api/settings/honeypot/blocklist")).json();
    expect(typeof listed.banHours).toBe("number");
    expect(
      (listed.entries as { ip: string }[]).some((e) => e.ip === "203.0.113.7"),
    ).toBe(true);

    const unbanned = await post("/api/settings/honeypot/unban", {
      ip: "203.0.113.7",
    });
    expect(unbanned.status).toBe(200);

    const after = await (await get("/api/settings/honeypot/blocklist")).json();
    expect(
      (after.entries as { ip: string }[]).some((e) => e.ip === "203.0.113.7"),
    ).toBe(false);
  });

  test.each([
    ["ban", "/api/settings/honeypot/ban"],
    ["unban", "/api/settings/honeypot/unban"],
  ])("%s without an ip is refused", async (_label, path) => {
    const res = await post(path, { ip: "   " });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing ip" });
  });

  test.each([
    ["ban", "/api/settings/honeypot/ban"],
    ["unban", "/api/settings/honeypot/unban"],
  ])("%s with a malformed body is refused", async (_label, path) => {
    const res = await post(path, "{ not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });
});

describe("POST /api/settings/sync", () => {
  test("only whitelisted sync keys survive", async () => {
    const res = await post("/api/settings/sync", {
      settings: {
        theme: "dark",
        sticky_sidebar: true,
        engines: { "acme-engine": true },
        not_a_sync_key: true,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.settings).toEqual({
      theme: "dark",
      sticky_sidebar: true,
      engines: { "acme-engine": true },
    });
  });

  test("a whitelisted key with an invalid value is dropped", async () => {
    const res = await post("/api/settings/sync", {
      settings: {
        theme: "aubergine",
        sticky_sidebar: "yes",
        engines: { "acme-engine": "true" },
        centered_mode: true,
      },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).settings).toEqual({ centered_mode: true });
  });

  test.each([
    ["a missing settings key", {}],
    ["an array", { settings: ["nope"] }],
    ["a primitive", { settings: "nope" }],
  ])("%s is refused", async (_label, body) => {
    const res = await post("/api/settings/sync", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing settings" });
  });

  test("an oversized payload is refused with 413", async () => {
    const res = await post("/api/settings/sync", {
      settings: { blob: "x".repeat(70_000) },
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Settings too large" });
  });
});

describe("shortcut source routes", () => {
  test("a posted source is stored under its canonical extension id", async () => {
    const res = await post("/api/settings/shortcuts/source", {
      name: "Jump To Top",
      source: "export default { name: 'x' };",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("jump-to-top-shortcut");
    expect(body.overwrite).toBe(false);
  });

  test("a name that already ends in the kind is not suffixed twice", async () => {
    const res = await post("/api/settings/shortcuts/source", {
      name: "My Fancy Shortcut",
      source: "export default { name: 'x' };",
    });
    expect((await res.json()).id).toBe("my-fancy-shortcut");
  });

  test("posting the same name again reports an overwrite", async () => {
    await post("/api/settings/shortcuts/source", {
      name: "Repeat Me",
      source: "export default { name: 'a' };",
    });
    const res = await post("/api/settings/shortcuts/source", {
      name: "Repeat Me",
      source: "export default { name: 'b' };",
    });
    expect((await res.json()).overwrite).toBe(true);
  });

  test.each([
    ["a missing source", { name: "x" }],
    ["a missing name", { source: "x" }],
    ["a non-string name", { name: 5, source: "x" }],
  ])("%s is refused", async (_label, body) => {
    const res = await post("/api/settings/shortcuts/source", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid shortcut source" });
  });

  test("deleting a shortcut that is not editable is forbidden", async () => {
    const res = await Promise.resolve(
      router.request(
        new Request("http://localhost/api/settings/shortcuts/source/not-a-real-one", {
          method: "DELETE",
        }),
      ),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Shortcut is not editable" });
  });
});

describe("POST /api/settings/proxy-test", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("a disabled proxy reports the direct ip and no proxy ip", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ip: "198.51.100.9" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    const res = await post("/api/settings/proxy-test", {
      proxyEnabled: "false",
      proxyUrls: "",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchSnapshot();
  });

  test("an unreachable ip service reports a null direct ip", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const res = await post("/api/settings/proxy-test", {
      proxyEnabled: "false",
      proxyUrls: "",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).directIp).toBeNull();
  });
});

afterEach(() => {
  settings.clearServerSettingsCache();
});
