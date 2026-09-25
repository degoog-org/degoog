import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearServerSettingsCache } from "../../src/server/utils/settings/server-settings";

const HANDLERS_MOD = "../../src/server/search/handlers";
const handlersReal = { ...(await import(HANDLERS_MOD)) };

const ENV_KEYS = ["DEGOOG_DATA_DIR", "DEGOOG_SERVER_SETTINGS_FILE", "DEGOOG_PLUGIN_SETTINGS_FILE"];
const savedEnv = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));
let tempDir = "";

const calls: { fn: string; params: Record<string, unknown> }[] = [];
const EMPTY = { query: "", type: "web", results: [], engineTimings: [], relatedSearches: [] };

let router: { request: (req: Request | string) => Response | Promise<Response> };

const lastCall = (): { fn: string; params: Record<string, unknown> } => calls[calls.length - 1];

const postJson = (url: string, body: unknown): Promise<Response> | Response =>
  router.request(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "degoog-search-params-"));
  process.env.DEGOOG_DATA_DIR = tempDir;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(tempDir, "server-settings.json");
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(tempDir, "plugin-settings.json");
  writeFileSync(process.env.DEGOOG_SERVER_SETTINGS_FILE, JSON.stringify({ settings: {} }));
  writeFileSync(process.env.DEGOOG_PLUGIN_SETTINGS_FILE, "{}");
  clearServerSettingsCache();
  mock.module(HANDLERS_MOD, () => ({
    ...handlersReal,
    handleSearch: async (params: Record<string, unknown>) => {
      calls.push({ fn: "search", params });
      return EMPTY;
    },
    handleRetry: async (params: Record<string, unknown>) => {
      calls.push({ fn: "retry", params });
      return EMPTY;
    },
  }));
  router = (await import("../../src/server/routes/search")).default;
});

afterAll(() => {
  mock.module(HANDLERS_MOD, () => handlersReal);
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  clearServerSettingsCache();
  rmSync(tempDir, { recursive: true, force: true });
});

const FULL_QUERY =
  "type=images&page=3&time=week&lang=de&dateFrom=2024-01-01&dateTo=2024-02-01" +
  "&imgColor=red&imgSize=large&imgType=photo&imgLayout=wide&safeMode=on";

const FULL_BODY = {
  engines: [],
  type: "images",
  page: 3,
  time: "week",
  lang: "de",
  dateFrom: "2024-01-01",
  dateTo: "2024-02-01",
  imgColor: "red",
  imgSize: "large",
  imgType: "photo",
  imgLayout: "wide",
  safeMode: "on",
};

const EXPECTED = {
  searchType: "images",
  page: 3,
  timeFilter: "week",
  lang: "de",
  dateFrom: "2024-01-01",
  dateTo: "2024-02-01",
  imageFilter: { color: "red", size: "large", type: "photo", layout: "wide", nsfw: "on" },
};

const DEFAULTS = {
  searchType: "web",
  page: 1,
  timeFilter: "any",
  lang: "",
  dateFrom: "",
  dateTo: "",
  imageFilter: undefined,
};

describe("search routes hand the handlers the same params", () => {
  test("GET /api/search reads every param from the query string", async () => {
    const res = await router.request(`http://localhost/api/search?q=rust&${FULL_QUERY}`);
    expect(res.status).toBe(200);
    const { fn, params } = lastCall();
    expect(fn).toBe("search");
    expect(params).toMatchObject({ query: "rust", ...EXPECTED });
    expect(typeof params.engines).toBe("object");
  });

  test("POST /api/search json reads every param from the body", async () => {
    const res = await postJson("http://localhost/api/search", { query: "rust", ...FULL_BODY });
    expect(res.status).toBe(200);
    const { fn, params } = lastCall();
    expect(fn).toBe("search");
    const { engines, ...rest } = params;
    expect(rest).toEqual({ query: "rust", ...EXPECTED });
    expect(Object.values(engines as Record<string, boolean>).every((on) => on === false)).toBe(true);
  });

  test("GET /api/search/retry reads the same params plus the engine", async () => {
    const res = await router.request(`http://localhost/api/search/retry?q=rust&engine=Brave&${FULL_QUERY}`);
    expect(res.status).toBe(200);
    const { fn, params } = lastCall();
    expect(fn).toBe("retry");
    expect(params).toMatchObject({ query: "rust", engineName: "Brave", ...EXPECTED });
    expect(params).not.toHaveProperty("origQ");
    expect(Object.keys(params).sort()).toEqual(
      ["dateFrom", "dateTo", "engineName", "engines", "imageFilter", "lang", "page", "query", "searchType", "timeFilter"],
    );
  });

  test("POST /api/search/retry reads the body plus the engine", async () => {
    const res = await postJson("http://localhost/api/search/retry", {
      query: "rust",
      engine: "Brave",
      ...FULL_BODY,
    });
    expect(res.status).toBe(200);
    const { fn, params } = lastCall();
    expect(fn).toBe("retry");
    const { engines, ...rest } = params;
    expect(rest).toEqual({ query: "rust", engineName: "Brave", ...EXPECTED });
    expect(Object.values(engines as Record<string, boolean>).every((on) => on === false)).toBe(true);
  });

  test("bodies fall back to defaults and the legacy nsfw key", async () => {
    await postJson("http://localhost/api/search", { query: "q", imgNsfw: "moderate" });
    expect(lastCall().params).toMatchObject({ ...DEFAULTS, imageFilter: { nsfw: "moderate" } });
    await postJson("http://localhost/api/search/retry", { query: "q", engine: "E", page: "junk" });
    expect(lastCall().params).toMatchObject(DEFAULTS);
  });

  test("the query string falls back to defaults and the legacy nsfw key", async () => {
    await router.request("http://localhost/api/search/retry?q=q&engine=E&imgNsfw=off&page=-4");
    expect(lastCall().params).toMatchObject({ ...DEFAULTS, imageFilter: { nsfw: "off" } });
  });
});
