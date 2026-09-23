import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type HonoLike = { routes?: { method: string; path: string }[] };

const MODULES = [
  "commands",
  "compat-engines",
  "extensions",
  "health",
  "honeypot",
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
  "teapot",
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

const ENV_SHAPED_MODULES = new Set(["pages"]);
const BUST = "?route-inventory";

const inventory = new Map<string, string[]>();
const savedEnv: Record<string, string | undefined> = {};
let totalHandlers = 0;

const rawRoutes = (mod: unknown): { method: string; path: string }[] =>
  (mod as { default?: HonoLike })?.default?.routes ?? [];

const listRoutes = (mod: unknown): string[] =>
  [...new Set(rawRoutes(mod).map((r) => `${r.method} ${r.path}`))].sort();

const record = (name: string, mod: unknown): void => {
  totalHandlers += rawRoutes(mod).length;
  inventory.set(name, listRoutes(mod));
};

beforeAll(async () => {
  for (const key of ISOLATED_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.DEGOOG_DATA_DIR = mkdtempSync(join(tmpdir(), "degoog-inventory-"));
  process.env.DEGOOG_PUBLIC_INSTANCE = "true";

  for (const name of MODULES) {
    const spec = ENV_SHAPED_MODULES.has(name)
      ? `../../src/server/routes/${name}${BUST}`
      : `../../src/server/routes/${name}`;
    record(name, await import(spec));
  }
  record("nojs", await import("../../src/server/nojs/router"));
});

afterAll(() => {
  for (const key of ISOLATED_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("every mounted router exposes the routes it did before", () => {
  for (const name of [...MODULES, "nojs"]) {
    test(`${name} route list is unchanged`, () => {
      expect(inventory.get(name)).toMatchSnapshot();
    });
  }
});

describe("the admin path is operator-defined, not hardcoded", () => {
  const CUSTOM_ADMIN_PATH = "not-the-default-admin-path";
  const CUSTOM_BUST = "?custom-admin-path";
  let customRoutes: string[] = [];

  beforeAll(async () => {
    process.env.DEGOOG_SETTINGS_PATH = CUSTOM_ADMIN_PATH;
    const mod = await import(`../../src/server/routes/pages${CUSTOM_BUST}`);
    customRoutes = listRoutes(mod);
    delete process.env.DEGOOG_SETTINGS_PATH;
  });

  test("DEGOOG_SETTINGS_PATH moves the admin routes", () => {
    const moved = customRoutes.filter((r) => r.includes(CUSTOM_ADMIN_PATH));
    expect(moved.length).toBeGreaterThan(0);
    expect(moved).toMatchSnapshot();
  });

  test("no admin route is pinned to the default path", () => {
    expect(customRoutes.filter((r) => r.includes("/admin"))).toEqual([]);
  });
});

describe("route shape invariants", () => {
  test("every path is absolute and every method is uppercase", () => {
    const offenders: string[] = [];
    for (const [name, routes] of inventory) {
      for (const entry of routes) {
        const [method, path] = entry.split(" ");
        if (!path?.startsWith("/")) offenders.push(`${name}: ${entry}`);
        if (method !== method.toUpperCase()) offenders.push(`${name}: ${entry}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no module silently stops exporting a router", () => {
    const empty = [...inventory]
      .filter(([, routes]) => routes.length === 0)
      .map(([name]) => name);
    expect(empty).toEqual([]);
  });

  test("the mounted surface totals stay put", () => {
    const unique = [...inventory.values()].reduce((n, r) => n + r.length, 0);
    expect({ unique, totalHandlers }).toMatchSnapshot();
  });
});
