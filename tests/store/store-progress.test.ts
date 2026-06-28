import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { runStoreExclusive } from "../../src/server/extensions/store/store-lock";

describe("store-lock serialization", () => {
  test("runStoreExclusive runs store operations one at a time", async () => {
    let active = 0;
    let maxActive = 0;
    const op = () =>
      runStoreExclusive(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      });
    await Promise.all([op(), op(), op(), op()]);
    expect(maxActive).toBe(1);
    expect(active).toBe(0);
  });
});

describe("store progress streaming", () => {
  let storeRouter: {
    request: (req: Request | string) => Response | Promise<Response>;
  };
  let tmp: string;
  let savedDataDir: string | undefined;
  let savedDanger: string | undefined;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "degoog-store-"));
    savedDataDir = process.env.DEGOOG_DATA_DIR;
    savedDanger = process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
    process.env.DEGOOG_DATA_DIR = tmp;
    process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";
    storeRouter = (await import("../../src/server/routes/store")).default;
  });

  afterAll(async () => {
    if (savedDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = savedDataDir;
    if (savedDanger === undefined) delete process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD;
    else process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = savedDanger;
    await rm(tmp, { recursive: true, force: true });
  });

  test("update-all stream emits an SSE done event", async () => {
    const res = await storeRouter.request(
      "http://localhost/api/store/update-all/stream",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: done");
    expect(text).toContain('"updated":0');
  });

  test("repos refresh stream emits an SSE done event", async () => {
    const res = await storeRouter.request(
      "http://localhost/api/store/repos/refresh/stream",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: done");
    expect(text).toContain('"refreshed":0');
  });

  test("refreshAllRepos reports no progress when there are no repos", async () => {
    const { refreshAllRepos } = await import(
      "../../src/server/extensions/store/repo-ops"
    );
    const seen: unknown[] = [];
    const results = await refreshAllRepos((p) => seen.push(p));
    expect(results).toEqual([]);
    expect(seen).toHaveLength(0);
  });

  test("refreshRepo throws when the requested repository is missing", async () => {
    const { refreshRepo } = await import(
      "../../src/server/extensions/store/repo-ops"
    );
    await expect(
      refreshRepo("https://github.com/nope/missing.git"),
    ).rejects.toThrow("Repository not found.");
  });
});

describe("store progress streaming auth (CSRF)", () => {
  let storeRouter: {
    request: (req: Request | string) => Response | Promise<Response>;
  };
  let tokenStore: {
    set: (t: string, exp: number) => void;
    delete: (t: string) => void;
  };
  let validToken: string;
  let tmp: string;
  let savedDataDir: string | undefined;
  let savedPasswords: string | undefined;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "degoog-store-csrf-"));
    savedDataDir = process.env.DEGOOG_DATA_DIR;
    savedPasswords = process.env.DEGOOG_SETTINGS_PASSWORDS;
    process.env.DEGOOG_DATA_DIR = tmp;
    process.env.DEGOOG_SETTINGS_PASSWORDS = "testpw";
    storeRouter = (await import("../../src/server/routes/store")).default;
    const tokens = await import("../../src/server/utils/settings-tokens");
    tokenStore = tokens.tokenStore;
    validToken = tokens.generateSettingsToken();
    tokenStore.set(validToken, Date.now() + tokens.TOKEN_TTL_MS);
  });

  afterAll(async () => {
    if (validToken) tokenStore.delete(validToken);
    if (savedDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = savedDataDir;
    if (savedPasswords === undefined) delete process.env.DEGOOG_SETTINGS_PASSWORDS;
    else process.env.DEGOOG_SETTINGS_PASSWORDS = savedPasswords;
    await rm(tmp, { recursive: true, force: true });
  });

  test("accepts the settings cookie like the non-stream store routes", async () => {
    const res = await storeRouter.request(
      new Request("http://localhost/api/store/update-all/stream", {
        headers: { cookie: `settings-token=${validToken}` },
      }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("event: done");
  });

  test("accepts an explicit query token", async () => {
    const res = await storeRouter.request(
      `http://localhost/api/store/update-all/stream?token=${validToken}`,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("event: done");
  });
});
