import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SHARED = join(tmpdir(), "degoog-indexer-tests");
mkdirSync(SHARED, { recursive: true });
process.env.DEGOOG_INDEXER_DIR = SHARED;
process.env.DEGOOG_INDEXER_DB = join(SHARED, "index.db");
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(SHARED, "server-settings.json");

import router from "../../src/server/routes/indexer";
import { clearAll } from "../../src/server/indexer/store/admin";
import { recordResults } from "../../src/server/indexer/store/record";
import { flushQueue } from "../../src/server/indexer/queue/queue";
import { setInstanceSettings } from "../../src/server/utils/settings/server-settings";
import {
  closeExportSession,
  getExportSession,
} from "../../src/server/indexer/transfer/sessions";
import { indexerDbForType } from "../../src/server/utils/paths";

const TYPE = "web";
const savedNoPassword = process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
const savedPublic = process.env.DEGOOG_PUBLIC_INSTANCE;

const call = (method: string, path: string, token: string, body?: unknown): Promise<Response> =>
  Promise.resolve(
    router.request(
      new Request(`http://localhost${path}`, {
        method,
        headers: { "Content-Type": "application/json", "x-settings-token": token },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    ),
  );

beforeAll(async () => {
  process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
  delete process.env.DEGOOG_PUBLIC_INSTANCE;
  await setInstanceSettings({ degoogIndexerEnabled: "true" });
  await clearAll();
  await recordResults("export me", TYPE, [
    { title: "T", url: "https://example.com/export", snippet: "s", source: "E" },
  ]);
  await flushQueue();
});

afterAll(() => {
  if (savedNoPassword === undefined) delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
  else process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = savedNoPassword;
  if (savedPublic === undefined) delete process.env.DEGOOG_PUBLIC_INSTANCE;
  else process.env.DEGOOG_PUBLIC_INSTANCE = savedPublic;
});

describe("indexer export routes", () => {
  test("a sqlite export session holds the live db and keeps it on close", async () => {
    const res = await call("POST", "/api/indexer/export/start", "tok-session", { type: TYPE });
    expect(res.status).toBe(200);
    const { sessionId, size } = await res.json();
    const session = getExportSession(sessionId);
    expect(session?.path).toBe(indexerDbForType(TYPE));
    expect(session?.cleanup).toBe(false);
    expect(session?.hold.length).toBeGreaterThan(0);
    expect(session?.size).toBe(size);
    closeExportSession(sessionId);
  });

  test("a second export from the same client inside the cooldown is refused", async () => {
    const first = await call("POST", "/api/indexer/export/start", "tok-cool", { type: TYPE });
    expect(first.status).toBe(200);
    closeExportSession((await first.json()).sessionId);

    const again = await call("POST", "/api/indexer/export/start", "tok-cool", { type: TYPE });
    expect(again.status).toBe(429);
    expect((await again.json()).error).toMatch(/^Cooldown active\. Retry in \d+s$/);

    const direct = await call("GET", `/api/indexer/export?type=${TYPE}`, "tok-cool");
    expect(direct.status).toBe(429);

    const other = await call("GET", `/api/indexer/export?type=${TYPE}`, "tok-other");
    expect(other.status).toBe(200);
    await other.arrayBuffer();
  });
});
