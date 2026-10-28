import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { initServerKey } from "../../src/server/utils/security/server-key";
import { fakeFaviconProviders, restoreFaviconProviders } from "../helpers/favicon-providers";
import type { ServerSettingValue } from "../../src/server/utils/settings/server-settings";

const SERVER_SETTINGS_MOD = "../../src/server/utils/settings/server-settings";
const serverSettingsReal = { ...(await import(SERVER_SETTINGS_MOD)) };
let instanceSettings: Record<string, ServerSettingValue> = {};

let pagesRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

let savedPublic: string | undefined;
let savedSettingsPath: string | undefined;

beforeAll(async () => {
  savedPublic = process.env.DEGOOG_PUBLIC_INSTANCE;
  savedSettingsPath = process.env.DEGOOG_SETTINGS_PATH;

  delete process.env.DEGOOG_PUBLIC_INSTANCE;
  delete process.env.DEGOOG_SETTINGS_PATH;

  mock.module(SERVER_SETTINGS_MOD, () => ({
    ...serverSettingsReal,
    getInstanceSettings: async () => instanceSettings,
    peekInstanceSettings: () => instanceSettings,
  }));
  await initServerKey();
  const mod = await import(
    `../../src/server/routes/pages/pages?pages-test=${Date.now()}`
  );
  pagesRouter = mod.default;
});

afterAll(() => {
  mock.module(SERVER_SETTINGS_MOD, () => serverSettingsReal);
  if (savedPublic !== undefined)
    process.env.DEGOOG_PUBLIC_INSTANCE = savedPublic;
  else delete process.env.DEGOOG_PUBLIC_INSTANCE;
  if (savedSettingsPath !== undefined)
    process.env.DEGOOG_SETTINGS_PATH = savedSettingsPath;
  else delete process.env.DEGOOG_SETTINGS_PATH;
});

describe("routes/pages", () => {
  test("GET / returns 200 and HTML", async () => {
    const res = await pagesRouter.request("http://localhost/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  test("GET /?q=foo redirects to /search", async () => {
    const res = await pagesRouter.request("http://localhost/?q=foo");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/search");
  });

  test("GET /search returns 200 and HTML", async () => {
    const res = await pagesRouter.request("http://localhost/search");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  test.each([
    [false, false, false, false],
    [false, false, true, false],
    [false, true, false, false],
    [false, true, true, true],
    [true, false, false, true],
    [true, false, true, true],
    [true, true, false, true],
    [true, true, true, true],
  ])(
    "GET /search reports favicon availability (provider=%s, indexer=%s, store=%s)",
    async (providers, indexer, store, expected) => {
      instanceSettings = {
        degoogIndexerEnabled: indexer,
        degoogFaviconStoreEnabled: store,
      };
      fakeFaviconProviders(providers);
      try {
        const html = await (await pagesRouter.request("http://localhost/search")).text();
        expect(html).toContain(`window.__DEGOOG_FAVICONS__={"providers":${expected}}`);
        expect(html).toContain('"refresh":false');
      } finally {
        instanceSettings = {};
        restoreFaviconProviders();
      }
    },
  );
});
