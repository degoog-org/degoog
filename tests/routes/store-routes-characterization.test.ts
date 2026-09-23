import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ExtensionStoreType } from "../../src/server/types/extension";

const ISOLATED_ENV = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_PLUGIN_SETTINGS_FILE",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
] as const;

const REPO_URL = "https://example.com/acme/extensions.git";

type Router = { request: (req: Request | string) => Response | Promise<Response> };

let router: Router;
let tempDir = "";
const savedEnv: Record<string, string | undefined> = {};

const get = (path: string): Promise<Response> =>
  Promise.resolve(router.request(`http://localhost${path}`));

const send = (method: string, path: string, body: unknown): Promise<Response> =>
  Promise.resolve(
    router.request(
      new Request(`http://localhost${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    ),
  );

const post = (path: string, body: unknown) => send("POST", path, body);
const del = (path: string, body: unknown) => send("DELETE", path, body);

const seedStore = (): void => {
  const repoPath = join(tempDir, "store", "acme-extensions");
  mkdirSync(join(repoPath, "plugins", "demo"), { recursive: true });
  writeFileSync(
    join(repoPath, "plugins", "demo", "index.js"),
    "export default {};",
  );
  writeFileSync(
    join(repoPath, "package.json"),
    JSON.stringify({
      plugins: [{ path: "plugins/demo", name: "Demo", version: "1.0.0" }],
    }),
  );
  writeFileSync(
    join(tempDir, "repos.json"),
    JSON.stringify({
      repos: [
        {
          url: REPO_URL,
          localPath: "acme-extensions",
          addedAt: "",
          lastFetched: "",
          name: "Acme",
          description: "",
          error: null,
        },
      ],
      installed: [],
    }),
  );
};

beforeAll(async () => {
  for (const key of ISOLATED_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  tempDir = mkdtempSync(join(tmpdir(), "degoog-store-routes-"));
  process.env.DEGOOG_DATA_DIR = tempDir;
  process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
  router = (await import("../../src/server/routes/store")).default;
});

afterAll(() => {
  for (const key of ISOLATED_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(join(tempDir, "store"), { recursive: true, force: true });
  rmSync(join(tempDir, "plugins"), { recursive: true, force: true });
  seedStore();
});

describe("store read routes", () => {
  test("repos lists what is in repos.json", async () => {
    const body = await (await get("/api/store/repos")).json();
    expect(body.repos).toHaveLength(1);
    expect(body.repos[0].url).toBe(REPO_URL);
  });

  test("items lists the catalogue across all repos", async () => {
    const body = await (await get("/api/store/items")).json();
    expect(body.items.map((i: { path: string }) => i.path)).toEqual([
      "plugins/demo",
    ]);
  });

  test("items for an unknown repo slug is a 404", async () => {
    const res = await get("/api/store/items/does-not-exist");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Repository not found" });
  });

  test("items for a known repo slug lists only that repo", async () => {
    const res = await get("/api/store/items/acme-extensions");
    expect(res.status).toBe(200);
    expect(
      (await res.json()).items.map((i: { path: string }) => i.path),
    ).toEqual(["plugins/demo"]);
  });

  test("installed starts empty", async () => {
    expect((await (await get("/api/store/installed")).json()).installed).toEqual(
      [],
    );
  });
});

describe("store mutation validation", () => {
  const endpoints = [
    "/api/store/install",
    "/api/store/uninstall",
    "/api/store/update",
  ];

  test.each(endpoints)("%s rejects a missing field", async (path) => {
    const res = await post(path, { repoUrl: REPO_URL, itemPath: "  " });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Missing repoUrl, itemPath, or type",
    });
  });

  test.each(endpoints)("%s rejects an unknown type", async (path) => {
    const res = await post(path, {
      repoUrl: REPO_URL,
      itemPath: "plugins/demo",
      type: "wormhole",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid type" });
  });

  test.each(endpoints)(
    "%s surfaces a failure from the store layer as a 400",
    async (path) => {
      const res = await post(path, {
        repoUrl: "https://example.com/nope/nope.git",
        itemPath: "plugins/demo",
        type: ExtensionStoreType.Plugin,
      });
      expect(res.status).toBe(400);
      expect(typeof (await res.json()).error).toBe("string");
    },
  );
});

describe("store install and uninstall over http", () => {
  test("installing then uninstalling round-trips through the routes", async () => {
    const installed = await post("/api/store/install", {
      repoUrl: REPO_URL,
      itemPath: "plugins/demo",
      type: ExtensionStoreType.Plugin,
    });
    expect(installed.status).toBe(200);
    expect(await installed.json()).toEqual({ ok: true });
    expect(existsSync(join(tempDir, "plugins", "acme-extensions-demo"))).toBe(
      true,
    );

    const listed = await (await get("/api/store/installed")).json();
    expect(listed.installed).toHaveLength(1);

    const removed = await post("/api/store/uninstall", {
      repoUrl: REPO_URL,
      itemPath: "plugins/demo",
      type: ExtensionStoreType.Plugin,
    });
    expect(removed.status).toBe(200);
    expect(existsSync(join(tempDir, "plugins", "acme-extensions-demo"))).toBe(
      false,
    );
  });

  test("whitespace around the identifiers is trimmed before use", async () => {
    const res = await post("/api/store/install", {
      repoUrl: `  ${REPO_URL}  `,
      itemPath: "  plugins/demo  ",
      type: ExtensionStoreType.Plugin,
    });
    expect(res.status).toBe(200);
    expect(existsSync(join(tempDir, "plugins", "acme-extensions-demo"))).toBe(
      true,
    );
  });
});

describe("store repo routes", () => {
  test("adding a repo without a url is refused", async () => {
    const res = await post("/api/store/repos", {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing url" });
  });

  test("deleting a repo without a url is refused", async () => {
    const res = await del("/api/store/repos", {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing url" });
  });

  test("a malformed delete body is treated as an empty one", async () => {
    const res = await del("/api/store/repos", "{ not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing url" });
  });

  test("repo status reports an entry per configured repo", async () => {
    const body = await (await get("/api/store/repos/status")).json();
    expect(Array.isArray(body.statuses)).toBe(true);
  });
});

describe("store untracked deletion over http", () => {
  test("an unmanaged folder is removed", async () => {
    const target = join(tempDir, "plugins", "hand-dropped");
    mkdirSync(target, { recursive: true });

    const res = await del("/api/store/untracked", {
      type: ExtensionStoreType.Plugin,
      folderName: "hand-dropped",
    });
    expect(res.status).toBe(200);
    expect(existsSync(target)).toBe(false);
  });

  test("an unknown type is refused", async () => {
    const res = await del("/api/store/untracked", {
      type: "wormhole",
      folderName: "x",
    });
    expect(res.status).toBe(400);
  });

  test("a traversing folder name is refused", async () => {
    const outside = join(tempDir, "outside");
    mkdirSync(outside, { recursive: true });

    const res = await del("/api/store/untracked", {
      type: ExtensionStoreType.Plugin,
      folderName: "../outside",
    });
    expect(res.status).toBe(400);
    expect(existsSync(outside)).toBe(true);
  });
});

describe("store progress streams", () => {
  test("update-all streams server-sent events and closes", async () => {
    const res = await get("/api/store/update-all/stream");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    expect(typeof text).toBe("string");
  });

  test("repo refresh streams server-sent events and closes", async () => {
    const res = await get("/api/store/repos/refresh/stream");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    await res.text();
  });
});

afterEach(() => {
  rmSync(join(tempDir, "plugins"), { recursive: true, force: true });
});
