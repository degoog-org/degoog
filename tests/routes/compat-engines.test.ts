import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearServerSettingsCache } from "../../src/server/utils/server-settings";

const SAVED_ENV_KEYS = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_FOURGET_DIR",
  "DEGOOG_SEARX_ENGINES_DIR",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
] as const;

const savedEnv = new Map<string, string | undefined>();

let tempDir: string;
let router: { request: (req: Request | string) => Response | Promise<Response> };

const enable = (searx: boolean, fourget: boolean): void => {
  writeFileSync(
    join(tempDir, "server-settings.json"),
    JSON.stringify({
      wizard: true,
      instanceId: "compat-route-test",
      settings: { searxCompatEnabled: searx, fourgetCompatEnabled: fourget },
    }),
  );
  clearServerSettingsCache();
};

interface Listing {
  engines?: { code: string; installed: boolean }[];
  error?: string;
}

const get = (path: string) => router.request(`http://localhost${path}`);

const post = (path: string, body: unknown) =>
  router.request(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeAll(async () => {
  for (const key of SAVED_ENV_KEYS) savedEnv.set(key, process.env[key]);
  tempDir = mkdtempSync(join(tmpdir(), "degoog-compat-routes-"));
  process.env.DEGOOG_DATA_DIR = tempDir;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(tempDir, "server-settings.json");
  process.env.DEGOOG_FOURGET_DIR = join(tempDir, "fourget");
  process.env.DEGOOG_SEARX_ENGINES_DIR = join(tempDir, "searx", "engines");
  delete process.env.DEGOOG_PUBLIC_INSTANCE;
  delete process.env.DEGOOG_SETTINGS_PASSWORDS;
  process.env.DEGOOG_DANGEROUSLY_NO_PASSWORD = "true";

  mkdirSync(join(tempDir, "fourget", "scraper"), { recursive: true });
  writeFileSync(join(tempDir, "fourget", "scraper", "wiby.php"), "<?php\nclass wiby{}\n");

  enable(true, false);
  router = (await import("../../src/server/routes/compat-engines")).default;
});

afterAll(() => {
  clearServerSettingsCache();
  rmSync(tempDir, { recursive: true, force: true });
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("/api/compat/:layer", () => {
  test("an unknown layer is a 404, not a crash", async () => {
    enable(true, true);
    const res = await get("/api/compat/altavista/engines");
    expect(res.status).toBe(404);
    expect(((await res.json()) as Listing).error).toContain("Unknown");
  });

  test("a layer that is switched off is a 404", async () => {
    enable(true, false);
    const res = await get("/api/compat/4get/engines");
    expect(res.status).toBe(404);
    expect(((await res.json()) as Listing).error).toContain("disabled");
  });

  test("the searx layer lists its catalogue through the generic route", async () => {
    enable(true, false);
    const res = await get("/api/compat/searx/engines");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Listing;
    expect(body.engines?.length).toBeGreaterThan(0);
  });

  test("the 4get layer lists its own catalogue and sees the disk", async () => {
    enable(false, true);
    const res = await get("/api/compat/4get/engines");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Listing;
    expect(body.engines?.find((entry) => entry.code === "wiby")?.installed).toBe(true);
    expect(body.engines?.find((entry) => entry.code === "ddg")?.installed).toBe(false);
  });

  test("each layer answers for itself, not for the other one", async () => {
    enable(true, true);
    const searx = (await (await get("/api/compat/searx/engines")).json()) as Listing;
    const fourget = (await (await get("/api/compat/4get/engines")).json()) as Listing;
    const searxCodes = new Set(searx.engines?.map((entry) => entry.code));
    expect(fourget.engines?.some((entry) => entry.code === "wiby")).toBe(true);
    expect(searxCodes.has("wiby")).toBe(false);
  });

  test("a mutation without a code is rejected before anything is touched", async () => {
    enable(false, true);
    const res = await post("/api/compat/4get/install", {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as Listing).error).toContain("Missing code");
  });

  test("a code that is not a string is refused, not a crash", async () => {
    enable(false, true);
    const res = await post("/api/compat/4get/install", { code: 12 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Listing).error).toContain("Missing code");
  });

  test("an unknown scraper is refused", async () => {
    enable(false, true);
    const res = await post("/api/compat/4get/install", { code: "not-a-scraper" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Listing).error).toContain("not a known");
  });
});
