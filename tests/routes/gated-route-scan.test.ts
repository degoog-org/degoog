import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { routeKey, scanRoutesDir, scanSource } from "../helpers/gated-route-scan";

const ROUTES_DIR = join(import.meta.dir, "../../src/server/routes");

// Mutations that are public on purpose. Keys are `file: METHOD <path source text>`.
const PUBLIC_MUTATIONS = new Set([
  'easter-eggs/teapot.ts: POST "/teapot"',
  'easter-eggs/teapot.ts: POST "/teapot/:variety"',
  'easter-eggs/uovadipasqua.ts: POST "/api/uovadipasqua/match"',
  'easter-eggs/uovadipasqua.ts: ALL "/api/uovadipasqua/:id/*"',
  'extensions/commands.ts: POST "/api/command"',
  "extensions/engine-routes.ts: ALL `${ENGINE_ROUTE_PREFIX}/:engineFolder/*`",
  'extensions/plugin-routes.ts: ALL "/api/plugin/:pluginId/*"',
  'search/lucky-route.ts: POST "/api/lucky"',
  'search/search-routes.ts: POST "/api/search"',
  'search/search-routes.ts: POST "/api/search/retry"',
  'search/slots.ts: POST "/api/slots"',
  'search/slots.ts: POST "/api/slots/glance"',
  'search/stream.ts: POST "/api/search/stream"',
  'search/suggest.ts: POST "/api/suggest"',
  'search/tab-search-route.ts: POST "/api/tab-search"',
  "security/honeypot.ts: POST path",
  'settings/settings-auth.ts: POST "/api/settings/auth"',
]);

describe("static scan of src/server/routes for ungated mutations", () => {
  const scanned = scanRoutesDir(ROUTES_DIR);

  test("the scan sees the mutation surface", () => {
    expect(scanned.filter((r) => r.gated).length).toBeGreaterThan(30);
  });

  test("every mutation route is gated by gandalf()/guardSettingsRoute()/settingsAuth() or declared public", () => {
    const ungated = scanned
      .filter((r) => !r.gated)
      .map(routeKey)
      .filter((key) => !PUBLIC_MUTATIONS.has(key));
    expect(ungated).toEqual([]);
  });

  test("no public allowlist entry is stale", () => {
    const open = new Set(scanned.filter((r) => !r.gated).map(routeKey));
    expect([...PUBLIC_MUTATIONS].filter((key) => !open.has(key))).toEqual([]);
  });
});

describe("gated-route scanner", () => {
  const scan = (src: string) =>
    scanSource("fixture.ts", src).map((r) => `${r.method} ${r.path} ${r.gated ? "gated" : "OPEN"}`);

  test("flags a mutation with no gate", () => {
    expect(scan(`router.post("/api/x", async (c) => c.json({}));`)).toEqual(['POST "/api/x" OPEN']);
  });

  test("accepts inline middleware and in-body guards", () => {
    const src = `
router.post("/a", settingsAuth(), async (c) => c.json({}));
router.delete("/b", async (c) => {
  const denied = await guardSettingsRoute(c, "DELETE /b");
  if (denied) return denied;
  return c.json({});
});
router.patch("/c", async (c) => (await gandalfAtTheGate(c)) ? c.json({}) : c.json({}, 401));
`;
    expect(scan(src)).toEqual(['POST "/a" gated', 'DELETE "/b" gated', 'PATCH "/c" gated']);
  });

  test("follows local helpers that wrap a gate, transitively", () => {
    const src = `
interface Resolved { ok: boolean }
const _guard = async (c) => {
  if (!(await gandalfAtTheGate(c))) return c.json({}, 401);
  return null;
};
const _mutate = (action) => async (c) => {
  const denied = await _guard(c);
  return denied ?? c.json({ action });
};
router.post(\`/api/\${name}\`, _mutate("x"));
`;
    expect(scan(src)).toEqual(['POST `/api/${name}` gated']);
  });

  test("gate names in strings or comments do not count", () => {
    const src = `
router.post("/a", async (c) => {
  // guardSettingsRoute(c) is called elsewhere
  return c.html(await getThemeHtml("gandalf"));
});
router.post("/b", async (c) => c.text("settingsAuth()"));
`;
    expect(scan(src)).toEqual(['POST "/a" OPEN', 'POST "/b" OPEN']);
  });

  test("router-level use() gates matching paths only", () => {
    const src = `
router.use("/admin/*", settingsAuth());
router.post("/admin/x", async (c) => c.json({}));
router.post("/public/x", async (c) => c.json({}));
`;
    expect(scan(src)).toEqual(['POST "/admin/x" gated', 'POST "/public/x" OPEN']);
  });

  test("on() and all() are scanned, reads and non-router deletes are not", () => {
    const src = `
router.get("/r", async (c) => c.json({}));
router.on(["GET", "POST"], "/o", handler);
router.all("/any/*", handler);
tokenStore.delete(token);
`;
    expect(scan(src)).toEqual(['POST "/o" OPEN', 'ALL "/any/*" OPEN']);
  });
});
