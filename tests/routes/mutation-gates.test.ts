import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { isolateRouteEnv } from "../helpers/route-modules";

type MountedRouter = {
  routes: { method: string; path: string }[];
  request: (req: Request) => Response | Promise<Response>;
};

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE", "ALL"]);
const REFUSED = [401, 403];

const PUBLIC_MUTATIONS = new Set([
  "ALL /*",
  "POST /api/command",
  "ALL /api/engine/:engineFolder/*",
  "POST /api/lucky",
  "ALL /api/plugin/:pluginId/*",
  "POST /api/search",
  "POST /api/search/retry",
  "POST /api/search/stream",
  "POST /api/settings/auth",
  "POST /api/slots",
  "POST /api/slots/glance",
  "POST /api/suggest",
  "POST /api/tab-search",
  "POST /api/uovadipasqua/match",
  "ALL /api/uovadipasqua/:id/*",
  "POST /nojs/search",
  "POST /teapot",
  "ALL /teapot/*",
  "POST /teapot/:variety",
]);

const probeUrl = (path: string): string =>
  `http://localhost${path.replace(/:[\w-]+(\{[^}]*\})?\??/g, "probe").replace(/\*/g, "probe")}`;

let router: MountedRouter;
let trapRoutes = new Set<string>();
let restoreEnv = (): void => {};
const realFetch = globalThis.fetch;
const outbound: string[] = [];

beforeAll(async () => {
  restoreEnv = isolateRouteEnv("degoog-mutation-gates-", { DEGOOG_SETTINGS_PASSWORDS: "probe-password" });
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    outbound.push(String(input instanceof Request ? input.url : input));
    throw new Error("mutation gate probe made an outbound request");
  }) as typeof fetch;
  router = (await import("../../src/server/routes/index")).default as unknown as MountedRouter;
  const { getTraps } = await import("../../src/server/extensions/honeypot/registry");
  trapRoutes = new Set(getTraps().flatMap((trap) => trap.paths.map((path) => `POST ${path}`)));
});

afterAll(() => {
  globalThis.fetch = realFetch;
  restoreEnv();
});

const mutationRoutes = (): string[] => [
  ...new Set(router.routes.filter((r) => MUTATION_METHODS.has(r.method)).map((r) => `${r.method} ${r.path}`)),
];

const isPublic = (key: string): boolean => PUBLIC_MUTATIONS.has(key) || trapRoutes.has(key);

describe("every mounted mutation route refuses an unauthenticated request", () => {
  test("the probe sees the mutation surface", () => {
    expect(mutationRoutes().filter((key) => !isPublic(key)).length).toBeGreaterThan(30);
  });

  test("unauthenticated mutations get 401 or 403 unless declared public", async () => {
    const answered: string[] = [];
    for (const key of mutationRoutes().filter((k) => !isPublic(k))) {
      const [method, path] = key.split(" ");
      const res = await router.request(
        new Request(probeUrl(path), {
          method: method === "ALL" ? "POST" : method,
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      );
      if (!REFUSED.includes(res.status)) answered.push(`${key} -> ${res.status}`);
    }
    expect(answered).toEqual([]);
    expect(outbound).toEqual([]);
  });

  test("no public allowlist entry is stale", () => {
    const mounted = new Set(mutationRoutes());
    expect([...PUBLIC_MUTATIONS].filter((key) => !mounted.has(key))).toEqual([]);
  });
});
