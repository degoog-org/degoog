import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SHARED = join(tmpdir(), "degoog-indexer-tests");
mkdirSync(SHARED, { recursive: true });
process.env.DEGOOG_INDEXER_DIR = SHARED;
process.env.DEGOOG_INDEXER_DB = join(SHARED, "index.db");
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(SHARED, "server-settings.json");

import router from "../../src/server/routes/indexer";
import { clearAll, getStats } from "../../src/server/indexer/store";
import { setInstanceSettings } from "../../src/server/utils/server-settings";

const get = (path: string): Promise<Response> =>
  Promise.resolve(router.request(`http://localhost${path}`));

const post = (path: string, body: unknown): Promise<Response> =>
  Promise.resolve(
    router.request(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );

let publicRestore: string | undefined;

const enable = async (over: Record<string, string> = {}): Promise<void> => {
  await setInstanceSettings({
    degoogIndexerEnabled: "true",
    degoogIndexerPublicExport: "false",
    ...over,
  });
};

describe("indexer routes", () => {
  beforeAll(async () => {
    publicRestore = process.env.DEGOOG_PUBLIC_INSTANCE;
    process.env.DEGOOG_PUBLIC_INSTANCE = "true";
    getStats();
    await clearAll();
  });

  afterAll(() => {
    if (publicRestore !== undefined) process.env.DEGOOG_PUBLIC_INSTANCE = publicRestore;
    else delete process.env.DEGOOG_PUBLIC_INSTANCE;
  });

  test("stats returns 404 when indexer disabled", async () => {
    await setInstanceSettings({ degoogIndexerEnabled: "false" });
    const res = await get("/api/indexer/stats");
    expect(res.status).toBe(404);
  });

  test("removed federation routes no longer exist", async () => {
    await enable();
    const push = await post("/api/indexer/push", { targetUrl: "https://x.example" });
    const receive = await post("/api/indexer/receive", {});
    expect(push.status).toBe(404);
    expect(receive.status).toBe(404);
  });

  test("rows + rows/delete require admin auth on a public instance", async () => {
    await enable();
    const rows = await get("/api/indexer/rows");
    const del = await post("/api/indexer/rows/delete", { items: [{ id: 1, engine_type: "web" }] });
    expect(rows.status).toBe(401);
    expect(del.status).toBe(401);
  });

  test("clear requires the indexer to be enabled", async () => {
    await setInstanceSettings({ degoogIndexerEnabled: "false" });
    const res = await post("/api/indexer/clear", { confirm: true });
    expect(res.status).toBe(404);
  });

  test("export requires admin auth on a public instance", async () => {
    await enable();
    const res = await get("/api/indexer/export?type=web");
    expect(res.status).toBe(401);
  });

  test("public export toggle no longer bypasses auth", async () => {
    await enable({ degoogIndexerPublicExport: "true" });
    const res = await get("/api/indexer/export?type=web");
    expect(res.status).toBe(401);
  });

  test("public-info endpoint no longer exists", async () => {
    await enable({ degoogIndexerPublicExport: "true" });
    const res = await get("/api/indexer/public-info");
    expect(res.status).toBe(404);
  });
});
