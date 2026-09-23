import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "bun:test";
import {
  getServerKeyHex,
  initServerKey,
} from "../../src/server/utils/security/server-key";
import {
  getInstanceSettings,
  updateInstanceSettings,
  type ServerSettingValue,
} from "../../src/server/utils/settings/server-settings";

type Router = {
  request: (req: Request | string) => Response | Promise<Response>;
};

let suggestRouter: Router;
let searchRouter: Router;

let _savedSettings: Record<string, ServerSettingValue> = {};

beforeAll(async () => {
  await initServerKey();
  const [suggestMod, searchMod] = await Promise.all([
    import("../../src/server/routes/suggest"),
    import("../../src/server/routes/search"),
  ]);
  suggestRouter = suggestMod.default;
  searchRouter = searchMod.default;

  const s = await getInstanceSettings();
  _savedSettings = {
    apiKeySuggestEnabled: s.apiKeySuggestEnabled ?? false,
    apiKeySearchEnabled: s.apiKeySearchEnabled ?? false,
  };
});

afterAll(async () => {
  await updateInstanceSettings(_savedSettings);
});

beforeEach(async () => {
  await updateInstanceSettings({
    apiKeySuggestEnabled: false,
    apiKeySearchEnabled: false,
  });
});

afterEach(async () => {
  await updateInstanceSettings({
    apiKeySuggestEnabled: false,
    apiKeySearchEnabled: false,
  });
});

const _bearer = (): Record<string, string> => {
  const key = getServerKeyHex();
  if (!key) throw new Error("server key not loaded");
  return { Authorization: `Bearer ${key}` };
};

const _enable = async (key: "apiKeySuggestEnabled" | "apiKeySearchEnabled") =>
  updateInstanceSettings({ [key]: true });

const _get = (
  router: Router,
  path: string,
  headers: Record<string, string> = {},
) => router.request(new Request(`http://localhost${path}`, { headers }));

const _post = (
  router: Router,
  path: string,
  body: string,
  headers: Record<string, string> = {},
) =>
  router.request(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    }),
  );

describe("guardApiKey - guarded endpoints", () => {
  test("GET /api/suggest is open, then guarded, then unlocked by the key", async () => {
    expect((await _get(suggestRouter, "/api/suggest?q=x")).status).not.toBe(401);
    await _enable("apiKeySuggestEnabled");
    expect((await _get(suggestRouter, "/api/suggest?q=x")).status).toBe(401);
    expect(
      (await _get(suggestRouter, "/api/suggest?q=x", _bearer())).status,
    ).not.toBe(401);
  });

  test("GET /api/search is open, then guarded, then unlocked by the key", async () => {
    expect((await _get(searchRouter, "/api/search")).status).not.toBe(401);
    await _enable("apiKeySearchEnabled");
    expect((await _get(searchRouter, "/api/search")).status).toBe(401);
    expect(
      (await _get(searchRouter, "/api/search", _bearer())).status,
    ).not.toBe(401);
  });
});

describe("guardApiKey - bearer token edge cases", () => {
  const hit = async (authHeader?: string) => {
    await _enable("apiKeySuggestEnabled");
    const headers: Record<string, string> =
      authHeader !== undefined ? { Authorization: authHeader } : {};
    return _get(suggestRouter, "/api/suggest?q=x", headers);
  };

  test("only a well formed bearer of the real key is accepted", async () => {
    const key = getServerKeyHex()!;
    const cases: [string, string, boolean][] = [
      ["wrong short token", "Bearer wrongtoken", true],
      ["64-char hex but wrong value", `Bearer ${"a".repeat(64)}`, true],
      ["63-char hex off by one short", `Bearer ${"a".repeat(63)}`, true],
      ["65-char hex off by one long", `Bearer ${"a".repeat(65)}`, true],
      ["64-char non-hex chars", `Bearer ${"z".repeat(64)}`, true],
      ["empty bearer value", "Bearer ", true],
      ["Bearer keyword only", "Bearer", true],
      ["very long token", `Bearer ${"a".repeat(10000)}`, true],
      [
        "embedded whitespace",
        `Bearer ${key.slice(0, 32)} ${key.slice(32)}`,
        true,
      ],
      ["unrelated Basic scheme", "Basic dXNlcjpwYXNz", true],
      ["uppercase BEARER keyword", `BEARER ${key}`, false],
      ["lowercase bearer keyword", `bearer ${key}`, false],
      ["extra whitespace padding", `Bearer  ${key}`, false],
    ];
    for (const [label, header, rejected] of cases) {
      const status = (await hit(header)).status;
      if (rejected) expect([label, status]).toEqual([label, 401]);
      else expect([label, status === 401]).toEqual([label, false]);
    }
  });

  test("lowercase authorization header name is still checked", async () => {
    const key = getServerKeyHex()!;
    await _enable("apiKeySuggestEnabled");
    const res = await suggestRouter.request(
      new Request("http://localhost/api/suggest?q=x", {
        headers: { authorization: `Bearer ${key}` },
      }),
    );
    expect(res.status).not.toBe(401);
  });
});

describe("guardApiKey - browser nonce path", () => {
  test("valid nonce via headers or query params passes when protection enabled", async () => {
    const { generateSearchNonce } = await import(
      "../../src/server/utils/security/search-nonce"
    );
    await _enable("apiKeySearchEnabled");
    const viaHeaders = generateSearchNonce();
    expect(
      (
        await _get(searchRouter, "/api/search", {
          "x-search-nonce": viaHeaders.n,
          "x-search-sig": viaHeaders.s,
        })
      ).status,
    ).not.toBe(401);

    const viaQuery = generateSearchNonce();
    expect(
      (
        await _get(
          searchRouter,
          `/api/search?searchNonce=${viaQuery.n}&searchSig=${viaQuery.s}`,
        )
      ).status,
    ).not.toBe(401);
  });

  test("tampered nonce signature → 401", async () => {
    const { generateSearchNonce } = await import(
      "../../src/server/utils/security/search-nonce"
    );
    await _enable("apiKeySearchEnabled");
    const { n } = generateSearchNonce();
    const res = await _get(searchRouter, "/api/search", {
      "x-search-nonce": n,
      "x-search-sig": "deadbeef",
    });
    expect(res.status).toBe(401);
  });
});

describe("guardApiKey - POST body attacks when protection disabled", () => {
  test("invalid JSON body → 400", async () => {
    const res = await suggestRouter.request(
      new Request("http://localhost/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json {{{{",
      }),
    );
    expect(res.status).toBe(400);
  });

  test("a missing or empty query returns an empty array, not an error", async () => {
    const posted = await _post(suggestRouter, "/api/suggest", "{}");
    expect(posted.status).toBe(200);
    expect(await posted.json()).toEqual([]);

    const empty = await _get(suggestRouter, "/api/suggest?q=");
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);
  });

  test("extremely long query → handled without crashing", async () => {
    const longQ = "a".repeat(100_000);
    const res = await _get(
      suggestRouter,
      `/api/suggest?q=${encodeURIComponent(longQ)}`,
    );
    expect([200, 400, 413, 429]).toContain(res.status);
  });
});

describe("guardApiKey - suggest and search use independent keys", () => {
  test("each endpoint answers to its own toggle", async () => {
    await updateInstanceSettings({
      apiKeySuggestEnabled: true,
      apiKeySearchEnabled: false,
    });
    expect((await _get(suggestRouter, "/api/suggest?q=x")).status).toBe(401);
    expect((await _get(searchRouter, "/api/search")).status).not.toBe(401);

    await updateInstanceSettings({
      apiKeySuggestEnabled: false,
      apiKeySearchEnabled: true,
    });
    expect((await _get(suggestRouter, "/api/suggest?q=x")).status).not.toBe(401);
    expect((await _get(searchRouter, "/api/search")).status).toBe(401);
  });

  test("both protected - both blocked, and the same key unlocks both", async () => {
    await updateInstanceSettings({
      apiKeySuggestEnabled: true,
      apiKeySearchEnabled: true,
    });
    expect((await _get(suggestRouter, "/api/suggest?q=x")).status).toBe(401);
    expect((await _get(searchRouter, "/api/search")).status).toBe(401);

    const h = _bearer();
    expect(
      (await _get(suggestRouter, "/api/suggest?q=x", h)).status,
    ).not.toBe(401);
    expect((await _get(searchRouter, "/api/search", h)).status).not.toBe(401);
  });
});
