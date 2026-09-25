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

const postSlots = (bytes: number): Promise<Response> =>
  Promise.resolve(
    slots.request(
      new Request("http://localhost/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
});

afterAll(() => {
  if (savedSettingsFile === undefined) delete process.env.DEGOOG_SERVER_SETTINGS_FILE;
  else process.env.DEGOOG_SERVER_SETTINGS_FILE = savedSettingsFile;
  settings.clearServerSettingsCache();
});

describe("public POST body limit", () => {
  test("no limit is applied until the admin sets one", async () => {
    await settings.updateInstanceSettings({ requestBodyMaxKb: "0" });
    settings.clearServerSettingsCache();
    const res = await postSlots(64 * 1024);
    expect(res.status).toBe(200);
  });

  test("bodies over the configured limit are refused with 413", async () => {
    await settings.updateInstanceSettings({ requestBodyMaxKb: "8" });
    settings.clearServerSettingsCache();
    expect((await postSlots(16 * 1024)).status).toBe(413);
    expect((await postSlots(1024)).status).toBe(200);
  });
});
