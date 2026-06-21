import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const dir = join(tmpdir(), `degoog-shortcuts-registry-tests-${Date.now()}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
process.env.DEGOOG_SHORTCUTS_DIR = dir;
process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(dir, "plugin-settings.json");

import {
  getClientShortcuts,
  getShortcutActions,
  getShortcutDisabledStates,
  getShortcutModuleSource,
  initShortcutsRegistry,
} from "../../src/server/extensions/shortcuts/registry";
import shortcutsRouter from "../../src/server/routes/shortcuts";

describe("shortcuts registry", () => {
  beforeAll(async () => {
    writeFileSync(
      join(dir, "focus-first.js"),
      `export default {
  name: "Focus first",
  description: "Focuses the first result.",
  defaultBinding: { key: "j", alt: true },
  run() {}
};`,
    );
    await initShortcutsRegistry();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.DEGOOG_SHORTCUTS_DIR;
    delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
  });

  test("loads flat shortcut files with canonical -shortcut ids", () => {
    const actions = getShortcutActions();
    expect(actions).toContainEqual({
      id: "focus-first-shortcut",
      kind: "single",
      defaultBinding: { key: "j", alt: true },
      displayName: "Focus first",
      description: "Focuses the first result.",
      source: "plugin",
      editable: true,
    });
  });

  test("exposes client module urls", async () => {
    const client = await getClientShortcuts();
    expect(client.length).toBeGreaterThan(0);
    expect(client[0].moduleUrl).toBe("/api/shortcuts/modules/focus-first-shortcut.js");
    const source = await getShortcutModuleSource("focus-first-shortcut");
    expect(source).toContain("Focus first");
  });

  test("serves the module over the .js route used by moduleUrl", async () => {
    const res = await shortcutsRouter.request(
      "/api/shortcuts/modules/focus-first-shortcut.js",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(await res.text()).toContain("Focus first");
  });

  test("reports disabled state per shortcut id (enabled by default)", async () => {
    const states = await getShortcutDisabledStates();
    expect(states["focus-first-shortcut"]).toBe(false);
  });

  test("rejects unknown ids and requests without the .js suffix", async () => {
    const missing = await shortcutsRouter.request(
      "/api/shortcuts/modules/nope.js",
    );
    expect(missing.status).toBe(404);
    const noExt = await shortcutsRouter.request(
      "/api/shortcuts/modules/focus-first-shortcut",
    );
    expect(noExt.status).toBe(404);
  });
});
