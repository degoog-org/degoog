import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeModulePath } from "../helpers/route-modules";

type Router = {
  request: (req: Request | string) => Response | Promise<Response>;
};

type Method = "GET" | "POST" | "PATCH" | "DELETE";

const ROUTER_MODULES = [
  "compat-engines",
  "extensions",
  "indexer",
  "pages",
  "searx-engines",
  "settings",
  "settings-backup",
  "setup",
  "store",
  "themes",
] as const;

type RouterKey = (typeof ROUTER_MODULES)[number];

const GATED_APIS: Array<{ method: Method; path: string; routerKey: RouterKey; body?: string }> = [
  { method: "GET", path: "/api/compat/searx/engines", routerKey: "compat-engines" },
  { method: "GET", path: "/api/compat/4get/engines", routerKey: "compat-engines" },
  { method: "POST", path: "/api/compat/searx/install", routerKey: "compat-engines", body: '{"code":"fake"}' },
  { method: "POST", path: "/api/compat/searx/update", routerKey: "compat-engines", body: '{"code":"fake"}' },
  { method: "POST", path: "/api/compat/searx/uninstall", routerKey: "compat-engines", body: '{"code":"fake"}' },
  { method: "POST", path: "/api/compat/4get/install", routerKey: "compat-engines", body: '{"code":"fake"}' },
  { method: "POST", path: "/api/compat/4get/update", routerKey: "compat-engines", body: '{"code":"fake"}' },
  { method: "POST", path: "/api/compat/4get/uninstall", routerKey: "compat-engines", body: '{"code":"fake"}' },

  { method: "GET", path: "/api/extensions/engine-foo/readme", routerKey: "extensions" },
  { method: "POST", path: "/api/extensions/engine-foo/settings", routerKey: "extensions" },
  { method: "POST", path: "/api/extensions/engine-foo/options/key", routerKey: "extensions" },
  { method: "POST", path: "/api/extensions/engine-foo/upload", routerKey: "extensions" },
  { method: "POST", path: "/api/extensions/transports/fetch/test", routerKey: "extensions" },

  { method: "GET", path: "/api/indexer/stats", routerKey: "indexer" },
  { method: "GET", path: "/api/indexer/types", routerKey: "indexer" },
  { method: "GET", path: "/api/indexer/sample?type=web", routerKey: "indexer" },
  { method: "GET", path: "/api/indexer/rows", routerKey: "indexer" },
  { method: "GET", path: "/api/indexer/export", routerKey: "indexer" },
  { method: "GET", path: "/api/indexer/export/chunk", routerKey: "indexer" },
  { method: "POST", path: "/api/indexer/rows/delete", routerKey: "indexer" },
  { method: "POST", path: "/api/indexer/import", routerKey: "indexer" },
  { method: "POST", path: "/api/indexer/export/start", routerKey: "indexer" },
  { method: "POST", path: "/api/indexer/export/end", routerKey: "indexer" },
  { method: "POST", path: "/api/indexer/import/start", routerKey: "indexer" },
  { method: "POST", path: "/api/indexer/import/chunk", routerKey: "indexer" },
  { method: "POST", path: "/api/indexer/import/complete", routerKey: "indexer" },
  { method: "POST", path: "/api/indexer/clear", routerKey: "indexer" },

  { method: "POST", path: "/api/cache/clear", routerKey: "pages" },

  { method: "GET", path: "/api/searx/engines", routerKey: "searx-engines" },
  { method: "POST", path: "/api/searx/install", routerKey: "searx-engines" },
  { method: "POST", path: "/api/searx/update", routerKey: "searx-engines" },
  { method: "POST", path: "/api/searx/uninstall", routerKey: "searx-engines" },

  { method: "GET", path: "/api/settings/api-key", routerKey: "settings" },
  { method: "POST", path: "/api/settings/api-key/regenerate", routerKey: "settings" },
  { method: "GET", path: "/api/settings/default-engines", routerKey: "settings" },
  { method: "POST", path: "/api/settings/default-engines", routerKey: "settings" },
  { method: "GET", path: "/api/settings/general", routerKey: "settings" },
  { method: "POST", path: "/api/settings/general", routerKey: "settings" },
  { method: "POST", path: "/api/settings/field", routerKey: "settings" },
  { method: "POST", path: "/api/settings/domain-action", routerKey: "settings" },
  { method: "GET", path: "/api/settings/honeypot/blocklist", routerKey: "settings" },
  { method: "POST", path: "/api/settings/honeypot/ban", routerKey: "settings" },
  { method: "POST", path: "/api/settings/honeypot/unban", routerKey: "settings" },
  { method: "POST", path: "/api/settings/proxy-test", routerKey: "settings" },
  { method: "GET", path: "/api/settings/restart-state", routerKey: "settings" },
  { method: "POST", path: "/api/settings/restart", routerKey: "settings" },
  { method: "GET", path: "/api/settings/shortcuts", routerKey: "settings" },
  { method: "POST", path: "/api/settings/shortcuts", routerKey: "settings" },
  { method: "GET", path: "/api/settings/shortcuts/scaffold", routerKey: "settings" },
  { method: "POST", path: "/api/settings/shortcuts/source", routerKey: "settings" },
  { method: "DELETE", path: "/api/settings/shortcuts/source/fake", routerKey: "settings" },
  { method: "POST", path: "/api/settings/sync", routerKey: "settings" },
  { method: "POST", path: "/api/settings/tab-order", routerKey: "settings" },

  { method: "GET", path: "/api/settings/export", routerKey: "settings-backup" },
  { method: "POST", path: "/api/settings/import", routerKey: "settings-backup" },

  { method: "PATCH", path: "/api/server-settings", routerKey: "setup" },

  { method: "GET", path: "/api/store/installed", routerKey: "store" },
  { method: "GET", path: "/api/store/items", routerKey: "store" },
  { method: "GET", path: "/api/store/items/fake", routerKey: "store" },
  { method: "GET", path: "/api/store/repos", routerKey: "store" },
  { method: "GET", path: "/api/store/repos/fake/asset?path=foo", routerKey: "store" },
  { method: "GET", path: "/api/store/repos/status", routerKey: "store" },
  { method: "GET", path: "/api/store/repos/refresh/stream", routerKey: "store" },
  { method: "GET", path: "/api/store/update-all/stream", routerKey: "store" },
  { method: "GET", path: "/api/store/screenshots/fake/plugin/item/thumb.png", routerKey: "store" },
  { method: "POST", path: "/api/store/repos", routerKey: "store" },
  { method: "DELETE", path: "/api/store/repos", routerKey: "store" },
  { method: "POST", path: "/api/store/repos/refresh", routerKey: "store" },
  { method: "POST", path: "/api/store/install", routerKey: "store" },
  { method: "POST", path: "/api/store/uninstall", routerKey: "store" },
  { method: "POST", path: "/api/store/update", routerKey: "store" },
  { method: "POST", path: "/api/store/update-all", routerKey: "store" },
  { method: "DELETE", path: "/api/store/untracked", routerKey: "store" },

  { method: "POST", path: "/api/theme/active", routerKey: "themes" },
];

const ISOLATED_ENV = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
] as const;

const routers = new Map<RouterKey, Router>();
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  for (const key of ISOLATED_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.DEGOOG_DATA_DIR = mkdtempSync(join(tmpdir(), "degoog-gated-"));
  process.env.DEGOOG_PUBLIC_INSTANCE = "true";
  for (const name of ROUTER_MODULES) {
    routers.set(name, (await import(`../../src/server/routes/${routeModulePath(name)}`)).default);
  }
});

afterAll(() => {
  for (const key of ISOLATED_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("gated APIs return 401 without token when DEGOOG_PUBLIC_INSTANCE is set", () => {
  for (const { method, path, routerKey, body } of GATED_APIS) {
    test(`${method} ${path} returns 401`, async () => {
      const router = routers.get(routerKey)!;
      const url = `http://localhost${path}`;
      const req =
        method === "GET"
          ? url
          : new Request(url, {
              method,
              headers: { "Content-Type": "application/json" },
              body: body ?? "{}",
            });
      const res = await router.request(req);
      expect(res.status).toBe(401);
    });
  }
});
