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
} from "../../src/server/utils/server-key";
import {
  getInstanceSettings,
  updateInstanceSettings,
  type ServerSettingValue,
} from "../../src/server/utils/server-settings";

type Router = {
  request: (req: Request | string) => Response | Promise<Response>;
};

let suggestRouter: Router;
let searchRouter: Router;
let streamRouter: Router;

let _savedSettings: Record<string, ServerSettingValue> = {};

beforeAll(async () => {
  await initServerKey();
  const [suggestMod, searchMod, streamMod] = await Promise.all([
    import("../../src/server/routes/suggest"),
    import("../../src/server/routes/search"),
    import("../../src/server/routes/search-stream"),
  ]);
  suggestRouter = suggestMod.default;
  searchRouter = searchMod.default;
  streamRouter = streamMod.default;

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

describe("guardApiKey - suggest endpoints", () => {
  const SUGGEST_ENDPOINTS = [
    {
      label: "GET /api/suggest",
      fn: (h: Record<string, string>) =>
        _get(suggestRouter, "/api/suggest?q=x", h),
    },
    {
      label: "POST /api/suggest",
      fn: (h: Record<string, string>) =>
        _post(suggestRouter, "/api/suggest", '{"query":"x"}', h),
    },
    {
      label: "GET /api/suggest/opensearch",
      fn: (h: Record<string, string>) =>
        _get(suggestRouter, "/api/suggest/opensearch?q=x", h),
    },
  ];

  describe("protection disabled - all pass through", () => {
    for (const { label, fn } of SUGGEST_ENDPOINTS) {
      test(label, async () => {
        const res = await fn({});
        expect(res.status).not.toBe(401);
      });
    }
  });

  describe("protection enabled - no auth → 401", () => {
    for (const { label, fn } of SUGGEST_ENDPOINTS) {
      test(label, async () => {
        await _enable("apiKeySuggestEnabled");
        const res = await fn({});
        expect(res.status).toBe(401);
      });
    }
  });

  describe("protection enabled - valid bearer → passes", () => {
    for (const { label, fn } of SUGGEST_ENDPOINTS) {
      test(label, async () => {
        await _enable("apiKeySuggestEnabled");
        const res = await fn(_bearer());
        expect(res.status).not.toBe(401);
      });
    }
  });

  describe("protection enabled - boolean true (not string) still gates", () => {
    test("GET /api/suggest blocked with boolean true setting", async () => {
      await updateInstanceSettings({ apiKeySuggestEnabled: true });
      const res = await _get(suggestRouter, "/api/suggest?q=x");
      expect(res.status).toBe(401);
    });
  });

  describe("protection enabled - boolean false allows through", () => {
    test("GET /api/suggest passes with boolean false setting", async () => {
      await updateInstanceSettings({ apiKeySuggestEnabled: false });
      const res = await _get(suggestRouter, "/api/suggest?q=x");
      expect(res.status).not.toBe(401);
    });
  });
});

describe("guardApiKey - search endpoints", () => {
  const SEARCH_ENDPOINTS = [
    {
      label: "GET /api/search",
      fn: (h: Record<string, string>) => _get(searchRouter, "/api/search", h),
    },
    {
      label: "POST /api/search",
      fn: (h: Record<string, string>) =>
        _post(searchRouter, "/api/search", '{"query":"x"}', h),
    },
    {
      label: "GET /api/search/retry",
      fn: (h: Record<string, string>) =>
        _get(searchRouter, "/api/search/retry?q=x&engine=google", h),
    },
    {
      label: "POST /api/search/retry",
      fn: (h: Record<string, string>) =>
        _post(
          searchRouter,
          "/api/search/retry",
          '{"query":"x","engine":"google"}',
          h,
        ),
    },
    {
      label: "GET /api/search/stream",
      fn: (h: Record<string, string>) =>
        _get(streamRouter, "/api/search/stream?q=x", h),
    },
  ];

  describe("protection disabled - all pass through", () => {
    for (const { label, fn } of SEARCH_ENDPOINTS) {
      test(label, async () => {
        const res = await fn({});
        expect(res.status).not.toBe(401);
      });
    }
  });

  describe("protection enabled - no auth → 401", () => {
    for (const { label, fn } of SEARCH_ENDPOINTS) {
      test(label, async () => {
        await _enable("apiKeySearchEnabled");
        const res = await fn({});
        expect(res.status).toBe(401);
      });
    }
  });

  describe("protection enabled - valid bearer → passes", () => {
    for (const { label, fn } of SEARCH_ENDPOINTS) {
      test(label, async () => {
        await _enable("apiKeySearchEnabled");
        const res = await fn(_bearer());
        expect(res.status).not.toBe(401);
      });
    }
  });
});

describe("guardApiKey - bearer token edge cases", () => {
  const hit = async (authHeader?: string) => {
    await _enable("apiKeySuggestEnabled");
    const headers: Record<string, string> =
      authHeader !== undefined ? { Authorization: authHeader } : {};
    return _get(suggestRouter, "/api/suggest?q=x", headers);
  };

  test("no Authorization header → 401", async () => {
    expect((await hit()).status).toBe(401);
  });

  test("wrong short token → 401", async () => {
    expect((await hit("Bearer wrongtoken")).status).toBe(401);
  });

  test("64-char hex but wrong value → 401", async () => {
    const fake = "a".repeat(64);
    expect((await hit(`Bearer ${fake}`)).status).toBe(401);
  });

  test("63-char hex (off by one short) → 401", async () => {
    const fake = "a".repeat(63);
    expect((await hit(`Bearer ${fake}`)).status).toBe(401);
  });

  test("65-char hex (off by one long) → 401", async () => {
    const fake = "a".repeat(65);
    expect((await hit(`Bearer ${fake}`)).status).toBe(401);
  });

  test("64-char non-hex chars → 401", async () => {
    expect((await hit(`Bearer ${"z".repeat(64)}`)).status).toBe(401);
  });

  test("empty bearer value → 401", async () => {
    expect((await hit("Bearer ")).status).toBe(401);
  });

  test("Bearer keyword only, no token → 401", async () => {
    expect((await hit("Bearer")).status).toBe(401);
  });

  test("very long token (10k chars) → 401", async () => {
    expect((await hit(`Bearer ${"a".repeat(10000)}`)).status).toBe(401);
  });

  test("token with embedded whitespace → 401 (regex stops at first space)", async () => {
    const key = getServerKeyHex()!;
    expect(
      (await hit(`Bearer ${key.slice(0, 32)} ${key.slice(32)}`)).status,
    ).toBe(401);
  });

  test("BEARER uppercase keyword → still accepted (regex is /i)", async () => {
    const key = getServerKeyHex()!;
    expect((await hit(`BEARER ${key}`)).status).not.toBe(401);
  });

  test("bearer lowercase keyword → still accepted (regex is /i)", async () => {
    const key = getServerKeyHex()!;
    expect((await hit(`bearer ${key}`)).status).not.toBe(401);
  });

  test("valid key with leading whitespace padding → 401", async () => {
    const key = getServerKeyHex()!;
    expect((await hit(`Bearer  ${key}`)).status).not.toBe(401);
  });

  test("completely unrelated auth scheme (Basic) → 401", async () => {
    expect((await hit("Basic dXNlcjpwYXNz")).status).toBe(401);
  });

  test("lowercase authorization header name → still checked", async () => {
    const key = getServerKeyHex()!;
    const res = await suggestRouter.request(
      new Request("http://localhost/api/suggest?q=x", {
        headers: { authorization: `Bearer ${key}` },
      }),
    );
    expect(res.status).not.toBe(401);
  });
});

describe("guardApiKey - browser nonce path", () => {
  test("valid nonce via headers passes when protection enabled", async () => {
    const { generateSearchNonce } = await import(
      "../../src/server/utils/search-nonce"
    );
    await _enable("apiKeySearchEnabled");
    const { n, s } = generateSearchNonce();
    const res = await _get(searchRouter, "/api/search", {
      "x-search-nonce": n,
      "x-search-sig": s,
    });
    expect(res.status).not.toBe(401);
  });

  test("valid nonce via query params passes when protection enabled", async () => {
    const { generateSearchNonce } = await import(
      "../../src/server/utils/search-nonce"
    );
    await _enable("apiKeySearchEnabled");
    const { n, s } = generateSearchNonce();
    const res = await _get(
      searchRouter,
      `/api/search?searchNonce=${n}&searchSig=${s}`,
    );
    expect(res.status).not.toBe(401);
  });

  test("tampered nonce signature → 401", async () => {
    const { generateSearchNonce } = await import(
      "../../src/server/utils/search-nonce"
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

  test("missing query field → returns empty array, not error", async () => {
    const res = await _post(suggestRouter, "/api/suggest", "{}");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("empty query string → returns empty array", async () => {
    const res = await _get(suggestRouter, "/api/suggest?q=");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
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
  test("suggest protected, search open - suggest blocked, search passes", async () => {
    await updateInstanceSettings({
      apiKeySuggestEnabled: true,
      apiKeySearchEnabled: false,
    });
    const suggestRes = await _get(suggestRouter, "/api/suggest?q=x");
    const searchRes = await _get(searchRouter, "/api/search");
    expect(suggestRes.status).toBe(401);
    expect(searchRes.status).not.toBe(401);
  });

  test("search protected, suggest open - search blocked, suggest passes", async () => {
    await updateInstanceSettings({
      apiKeySuggestEnabled: false,
      apiKeySearchEnabled: true,
    });
    const suggestRes = await _get(suggestRouter, "/api/suggest?q=x");
    const searchRes = await _get(searchRouter, "/api/search");
    expect(suggestRes.status).not.toBe(401);
    expect(searchRes.status).toBe(401);
  });

  test("both protected - both blocked without auth", async () => {
    await updateInstanceSettings({
      apiKeySuggestEnabled: true,
      apiKeySearchEnabled: true,
    });
    const suggestRes = await _get(suggestRouter, "/api/suggest?q=x");
    const searchRes = await _get(searchRouter, "/api/search");
    expect(suggestRes.status).toBe(401);
    expect(searchRes.status).toBe(401);
  });

  test("both protected - same key unlocks both", async () => {
    await updateInstanceSettings({
      apiKeySuggestEnabled: true,
      apiKeySearchEnabled: true,
    });
    const h = _bearer();
    const suggestRes = await _get(suggestRouter, "/api/suggest?q=x", h);
    const searchRes = await _get(searchRouter, "/api/search", h);
    expect(suggestRes.status).not.toBe(401);
    expect(searchRes.status).not.toBe(401);
  });
});
