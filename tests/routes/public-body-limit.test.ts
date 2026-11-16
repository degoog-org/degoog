import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Router = {
  request: (req: Request) => Response | Promise<Response>;
};

let slots: Router;
let savedSettingsFile: string | undefined;
let settings: typeof import("../../src/server/utils/settings/server-settings");
let envBodySizeKb: (raw?: string) => number;
let DEFAULT_BODY_SIZE_KB: number;

const EVENT_STREAM = "text/event-stream";

const postSlots = (bytes: number, accept?: string): Promise<Response> =>
  Promise.resolve(
    slots.request(
      new Request("http://localhost/api/slots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accept ? { Accept: accept } : {}),
        },
        body: JSON.stringify({ query: "", pad: "x".repeat(bytes) }),
      }),
    ),
  );

beforeAll(async () => {
  savedSettingsFile = process.env.DEGOOG_SERVER_SETTINGS_FILE;
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(
    mkdtempSync(join(tmpdir(), "degoog-body-limit-")),
    "server-settings.json",
  );
  settings = await import("../../src/server/utils/settings/server-settings");
  settings.clearServerSettingsCache();
  slots = (await import("../../src/server/routes/search/slots")).default;
  ({ envBodySizeKb, DEFAULT_BODY_SIZE_KB } = await import("../../src/server/routes/_guards"));
});

afterAll(() => {
  if (savedSettingsFile === undefined) delete process.env.DEGOOG_SERVER_SETTINGS_FILE;
  else process.env.DEGOOG_SERVER_SETTINGS_FILE = savedSettingsFile;
  settings.clearServerSettingsCache();
});

describe("public POST body limit", () => {
  const withEnv = async (value: string | undefined, run: () => Promise<void>): Promise<void> => {
    const saved = process.env.DEGOOG_BODY_SIZE;
    if (value === undefined) delete process.env.DEGOOG_BODY_SIZE;
    else process.env.DEGOOG_BODY_SIZE = value;
    try {
      await run();
    } finally {
      if (saved === undefined) delete process.env.DEGOOG_BODY_SIZE;
      else process.env.DEGOOG_BODY_SIZE = saved;
    }
  };

  test("the instance default is 3 MB when nothing is configured", async () => {
    await settings.updateInstanceSettings({ requestBodyMaxKb: "0" });
    settings.clearServerSettingsCache();
    await withEnv(undefined, async () => {
      expect((await postSlots(64 * 1024)).status).toBe(200);
      expect((await postSlots(3 * 1024 * 1024 + 1024)).status).toBe(413);
    });
  });

  test("DEGOOG_BODY_SIZE sets the default in KB", async () => {
    await settings.updateInstanceSettings({ requestBodyMaxKb: "0" });
    settings.clearServerSettingsCache();
    await withEnv("16", async () => {
      expect((await postSlots(1024)).status).toBe(200);
      expect((await postSlots(32 * 1024)).status).toBe(413);
    });
  });

  test("DEGOOG_BODY_SIZE=0 removes the default limit", async () => {
    await settings.updateInstanceSettings({ requestBodyMaxKb: "0" });
    settings.clearServerSettingsCache();
    await withEnv("0", async () => {
      expect((await postSlots(4 * 1024 * 1024)).status).toBe(200);
    });
  });

  test("an unparseable DEGOOG_BODY_SIZE falls back to 3 MB", async () => {
    expect(envBodySizeKb("lots")).toBe(DEFAULT_BODY_SIZE_KB);
    expect(envBodySizeKb("")).toBe(DEFAULT_BODY_SIZE_KB);
    expect(envBodySizeKb("-5")).toBe(DEFAULT_BODY_SIZE_KB);
    expect(envBodySizeKb(" 512 ")).toBe(512);
  });

  test("a streamed slot call sits behind the same limit", async () => {
    await settings.updateInstanceSettings({ requestBodyMaxKb: "8" });
    settings.clearServerSettingsCache();
    await withEnv(undefined, async () => {
      expect((await postSlots(16 * 1024, EVENT_STREAM)).status).toBe(413);
      const streamed = await postSlots(1024, EVENT_STREAM);
      expect(streamed.status).toBe(200);
      expect(streamed.headers.get("content-type")).toBe(EVENT_STREAM);
      expect(await streamed.text()).toBe('event: done\ndata: {"pending":false}\n\n');
    });
  });

  test("the admin setting wins over DEGOOG_BODY_SIZE", async () => {
    await settings.updateInstanceSettings({ requestBodyMaxKb: "8" });
    settings.clearServerSettingsCache();
    await withEnv("0", async () => {
      expect((await postSlots(16 * 1024)).status).toBe(413);
      expect((await postSlots(1024)).status).toBe(200);
    });
  });
});
