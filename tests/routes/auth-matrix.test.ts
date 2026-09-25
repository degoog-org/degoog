import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeModulePath } from "../helpers/route-modules";
import type { ServerSettingValue } from "../../src/server/utils/settings/server-settings";

type HonoLike = {
  routes?: { method: string; path: string }[];
  request: (req: Request) => Response | Promise<Response>;
};

const MODULES = [
  "commands",
  "compat-engines",
  "extensions",
  "health",
  "indexer",
  "pages",
  "plugin-assets",
  "plugin-routes",
  "proxy",
  "rate-limit",
  "search",
  "search-bar",
  "search/stream",
  "searx-engines",
  "settings",
  "settings-auth",
  "settings-backup",
  "setup",
  "shortcuts",
  "slots",
  "store",
  "suggest",
  "sw",
  "themes",
  "uovadipasqua",
] as const;

const ISOLATED_ENV = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_INDEXER_DIR",
  "DEGOOG_PLUGIN_SETTINGS_FILE",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
  "DEGOOG_SETTINGS_PATH",
  "DEGOOG_BASE_URL",
] as const;

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const PUBLIC_MUTATIONS = new Set([
  "POST /api/search",
  "POST /api/search/retry",
  "POST /api/suggest",
  "POST /api/slots",
  "POST /api/slots/glance",
  "POST /nojs/search",
]);

const FRESH_MODULES = new Set(["health", "pages"]);
const BUST = "?auth-matrix";
const REQUEST_TIMEOUT_MS = 5000;

const routers = new Map<string, HonoLike>();
const matrix = new Map<string, string[]>();
const indexerEnabledMatrix: string[] = [];
const savedEnv: Record<string, string | undefined> = {};
let restoreNojs: ServerSettingValue | undefined;

const concrete = (path: string): string =>
  path.replace(/:[^/]+/g, "probe").replace(/\*/g, "probe");

const probe = async (
  router: HonoLike,
  method: string,
  path: string,
): Promise<string> => {
  const verb = method === "ALL" ? "GET" : method;
  const init: RequestInit =
    verb === "GET" || verb === "HEAD"
      ? { method: verb }
      : {
          method: verb,
          headers: { "Content-Type": "application/json" },
          body: "{}",
        };
  try {
    const res = await Promise.race([
      Promise.resolve(
        router.request(new Request(`http://localhost${concrete(path)}`, init)),
      ),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("timed out")), REQUEST_TIMEOUT_MS),
      ),
    ]);
    return String(res.status);
  } catch (err) {
    return `threw: ${(err as Error).message}`;
  }
};

beforeAll(async () => {
  for (const key of ISOLATED_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.DEGOOG_DATA_DIR = mkdtempSync(join(tmpdir(), "degoog-authmx-"));
  process.env.DEGOOG_PUBLIC_INSTANCE = "true";

  for (const name of MODULES) {
    const spec = FRESH_MODULES.has(name)
      ? `../../src/server/routes/${routeModulePath(name)}${BUST}`
      : `../../src/server/routes/${routeModulePath(name)}`;
    routers.set(name, (await import(spec)).default);
  }
  routers.set("nojs", (await import("../../src/server/nojs/router")).default);

  const { clearServerSettingsCache: clearCache, getInstanceSettings, updateInstanceSettings: update } =
    await import("../../src/server/utils/settings/server-settings");
  clearCache();
  const priorSettings = await getInstanceSettings();
  restoreNojs = priorSettings.nojsEnabled as ServerSettingValue | undefined;
  await update({ nojsEnabled: false });
  clearCache();

  for (const [name, router] of routers) {
    const seen = new Set<string>();
    const rows: string[] = [];
    for (const route of router.routes ?? []) {
      const key = `${route.method} ${route.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(`${key} -> ${await probe(router, route.method, route.path)}`);
    }
    matrix.set(name, rows.sort());
  }

  const { clearServerSettingsCache, updateInstanceSettings } = await import(
    "../../src/server/utils/settings/server-settings"
  );
  await updateInstanceSettings({ degoogIndexerEnabled: "true" });
  clearServerSettingsCache();
  const indexer = routers.get("indexer");
  if (indexer) {
    const seen = new Set<string>();
    for (const route of indexer.routes ?? []) {
      const key = `${route.method} ${route.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      indexerEnabledMatrix.push(
        `${key} -> ${await probe(indexer, route.method, route.path)}`,
      );
    }
    indexerEnabledMatrix.sort();
  }
  await updateInstanceSettings({
    degoogIndexerEnabled: "false",
    ...(restoreNojs === undefined ? {} : { nojsEnabled: restoreNojs }),
  });
  clearServerSettingsCache();
}, 180000);

afterAll(() => {
  for (const key of ISOLATED_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("what an unauthenticated caller gets from every route", () => {
  for (const name of [...MODULES, "nojs"]) {
    test(`${name} unauthenticated responses are unchanged (nojs pinned off)`, () => {
      expect(matrix.get(name)).toMatchSnapshot();
    });
  }
});

describe("gate invariants that no snapshot update may waive", () => {
  const rows = (): { module: string; method: string; path: string; status: string }[] =>
    [...matrix].flatMap(([module, entries]) =>
      entries.map((entry) => {
        const [signature, status] = entry.split(" -> ");
        const [method, ...rest] = signature.split(" ");
        return { module, method, path: rest.join(" "), status };
      }),
    );

  test("every mutation route answers 401 unless it is a declared public mutation", () => {
    const ungated = rows()
      .filter((r) => MUTATION_METHODS.has(r.method))
      .filter((r) => !r.path.startsWith("/api/indexer/"))
      .filter((r) => !PUBLIC_MUTATIONS.has(`${r.method} ${r.path}`))
      .filter((r) => r.status !== "401")
      .map((r) => `${r.module}: ${r.method} ${r.path} -> ${r.status}`);
    expect(ungated).toEqual([]);
  });

  test("every store route is gated", () => {
    const open = rows()
      .filter((r) => r.path.startsWith("/api/store/"))
      .filter((r) => r.status !== "401")
      .map((r) => `${r.method} ${r.path} -> ${r.status}`);
    expect(open).toEqual([]);
  });

  test("a disabled indexer answers 404 before it answers 401", () => {
    const wrong = rows()
      .filter((r) => r.path.startsWith("/api/indexer/"))
      .filter((r) => r.status !== "404")
      .map((r) => `${r.method} ${r.path} -> ${r.status}`);
    expect(wrong).toEqual([]);
  });

  test("an enabled indexer gates every one of its routes", () => {
    const open = indexerEnabledMatrix.filter((row) => !row.endsWith(" -> 401"));
    expect(open).toEqual([]);
  });

  test("a disabled searx compat layer answers 401 before it answers 404", () => {
    const wrong = rows()
      .filter((r) => r.module === "searx-engines")
      .filter((r) => r.status !== "401")
      .map((r) => `${r.method} ${r.path} -> ${r.status}`);
    expect(wrong).toEqual([]);
  });

  test("the unauthenticated extension listing stays reachable so it can redact", () => {
    const listing = rows().find(
      (r) => r.method === "GET" && r.path === "/api/extensions",
    );
    expect(listing?.status).toBe("200");
  });

  test("plugin-owned catch-all routes are probed by GET only and carry no mutation guarantee", () => {
    const catchAlls = rows()
      .filter((r) => r.method === "ALL")
      .map((r) => `${r.module}: ${r.path}`);
    expect(catchAlls).toMatchSnapshot();
  });
});
