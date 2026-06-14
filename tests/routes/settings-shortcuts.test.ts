import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SHARED = join(tmpdir(), "degoog-settings-shortcuts-tests");
mkdirSync(SHARED, { recursive: true });
process.env.DEGOOG_SERVER_SETTINGS_FILE = join(SHARED, "server-settings.json");
process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(SHARED, "plugin-settings.json");

import router from "../../src/server/routes/settings";
import {
  clearServerSettingsCache,
  setInstanceSettings,
} from "../../src/server/utils/server-settings";
import { clearShortcutsSettingsCache } from "../../src/server/utils/shortcuts-settings";

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

describe("settings shortcut routes", () => {
  beforeAll(() => {
    delete process.env.DEGOOG_PUBLIC_INSTANCE;
    delete process.env.DEGOOG_SETTINGS_PASSWORDS;
  });

  beforeEach(() => {
    clearShortcutsSettingsCache();
  });

  afterEach(async () => {
    await setInstanceSettings({});
    clearServerSettingsCache();
    clearShortcutsSettingsCache();
  });

  test("POST accepts valid shortcuts and GET returns the stored map", async () => {
    const save = await post("/api/settings/shortcuts", {
      shortcuts: {
        "focus-search": { key: "k", ctrl: true },
      },
    });
    expect(save.status).toBe(200);

    const res = await get("/api/settings/shortcuts");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.shortcuts).toEqual({
      "focus-search": { key: "k", ctrl: true },
    });
    expect(Array.isArray(data.custom)).toBe(true);
  });

  test("POST rejects invalid shortcut maps", async () => {
    const unknown = await post("/api/settings/shortcuts", {
      shortcuts: { unknown: { key: "x" } },
    });
    expect(unknown.status).toBe(400);

    const badShape = await post("/api/settings/shortcuts", {
      shortcuts: { "focus-search": { key: 3 } },
    });
    expect(badShape.status).toBe(400);
  });
});
