import { describe, test, expect, beforeAll, afterAll } from "bun:test";

type Router = {
  request: (req: Request | string) => Response | Promise<Response>;
};

const GATED_APIS: Array<{
  method: "GET" | "POST" | "DELETE";
  path: string;
  routerKey: "store" | "themes" | "extensions" | "pages" | "compat";
  body?: string;
}> = [
  {
    method: "POST",
    path: "/api/theme/active",
    routerKey: "themes",
    body: "{}",
  },
  {
    method: "POST",
    path: "/api/extensions/engine-foo/settings",
    routerKey: "extensions",
    body: "{}",
  },
  { method: "POST", path: "/api/cache/clear", routerKey: "pages" },
  {
    method: "GET",
    path: "/api/store/repos/fake/asset?path=foo",
    routerKey: "store",
  },
  { method: "GET", path: "/api/store/repos/status", routerKey: "store" },
  { method: "POST", path: "/api/store/repos", routerKey: "store", body: "{}" },
  {
    method: "DELETE",
    path: "/api/store/repos",
    routerKey: "store",
    body: "{}",
  },
  {
    method: "POST",
    path: "/api/store/repos/refresh",
    routerKey: "store",
    body: "{}",
  },
  { method: "GET", path: "/api/store/items", routerKey: "store" },
  { method: "GET", path: "/api/store/items/fake", routerKey: "store" },
  {
    method: "POST",
    path: "/api/store/install",
    routerKey: "store",
    body: "{}",
  },
  {
    method: "POST",
    path: "/api/store/uninstall",
    routerKey: "store",
    body: "{}",
  },
  { method: "GET", path: "/api/store/installed", routerKey: "store" },
  {
    method: "GET",
    path: "/api/store/screenshots/fake/plugin/item/thumb.png",
    routerKey: "store",
  },
  { method: "GET", path: "/api/compat/searx/engines", routerKey: "compat" },
  { method: "GET", path: "/api/compat/4get/engines", routerKey: "compat" },
  {
    method: "POST",
    path: "/api/compat/searx/install",
    routerKey: "compat",
    body: '{"code":"fake"}',
  },
  {
    method: "POST",
    path: "/api/compat/searx/update",
    routerKey: "compat",
    body: '{"code":"fake"}',
  },
  {
    method: "POST",
    path: "/api/compat/searx/uninstall",
    routerKey: "compat",
    body: '{"code":"fake"}',
  },
  {
    method: "POST",
    path: "/api/compat/4get/install",
    routerKey: "compat",
    body: '{"code":"fake"}',
  },
  {
    method: "POST",
    path: "/api/compat/4get/update",
    routerKey: "compat",
    body: '{"code":"fake"}',
  },
  {
    method: "POST",
    path: "/api/compat/4get/uninstall",
    routerKey: "compat",
    body: '{"code":"fake"}',
  },
];

let routers: Record<string, Router>;
let envRestore: string | undefined;

beforeAll(async () => {
  envRestore = process.env.DEGOOG_PUBLIC_INSTANCE;
  process.env.DEGOOG_PUBLIC_INSTANCE = "true";
  const [storeMod, themesMod, extensionsMod, pagesMod, compatMod] = await Promise.all([
    import("../../src/server/routes/store"),
    import("../../src/server/routes/themes"),
    import("../../src/server/routes/extensions"),
    import("../../src/server/routes/pages"),
    import("../../src/server/routes/compat-engines"),
  ]);
  routers = {
    store: storeMod.default,
    themes: themesMod.default,
    extensions: extensionsMod.default,
    pages: pagesMod.default,
    compat: compatMod.default,
  };
});

afterAll(() => {
  if (envRestore !== undefined) process.env.DEGOOG_PUBLIC_INSTANCE = envRestore;
  else delete process.env.DEGOOG_PUBLIC_INSTANCE;
});

describe("gated APIs return 401 without token when DEGOOG_PUBLIC_INSTANCE is set", () => {
  for (const { method, path, routerKey, body } of GATED_APIS) {
    test(`${method} ${path} returns 401`, async () => {
      const router = routers[routerKey];
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
