import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  clearPluginSettingsCache,
  setSettings,
} from "../src/server/utils/settings/plugin-settings";
import {
  loadPluginAssets,
  prunePluginAssets,
  addPluginCss,
  getEnabledPluginCss,
  pluginCssVersion,
  registerPluginScript,
  getPluginScriptFolders,
  getScriptFolderSource,
  buildRouteUrl,
  initPlugin,
} from "../src/server/utils/extension-support/plugin-assets";
import type { PluginContext } from "../src/server/types/extension";

const settingsDir = mkdtempSync(join(tmpdir(), "degoog-plugin-css-"));
const prevSettingsFile = process.env.DEGOOG_PLUGIN_SETTINGS_FILE;

beforeAll(() => {
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(settingsDir, "plugin-settings.json");
  clearPluginSettingsCache();
});

afterAll(() => {
  if (prevSettingsFile === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
  else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prevSettingsFile;
  clearPluginSettingsCache();
  rmSync(settingsDir, { recursive: true, force: true });
});

describe("plugin-assets", () => {
  test("addPluginCss and getEnabledPluginCss", async () => {
    addPluginCss("p1", ".p1 { color: red; }");
    addPluginCss("p2", ".p2 { color: blue; }");
    const all = await getEnabledPluginCss();
    expect(all).toContain(".p1 { color: red; }");
    expect(all).toContain(".p2 { color: blue; }");
  });

  test("plugin css order does not depend on load order", async () => {
    addPluginCss("order-b-slot", ".order-b { color: red; }");
    addPluginCss("order-a-slot", ".order-a { color: red; }");
    const css = await getEnabledPluginCss();
    expect(css.indexOf(".order-a")).toBeLessThan(css.indexOf(".order-b"));
  });

  test("stylesheet version follows plugins being added and disabled", async () => {
    const before = pluginCssVersion(await getEnabledPluginCss());
    addPluginCss("late-plugin-slot", ".late { color: green; }");
    const added = await getEnabledPluginCss();
    expect(added).toContain(".late { color: green; }");
    expect(pluginCssVersion(added)).not.toBe(before);

    await setSettings("late-plugin-slot", { disabled: true });
    const disabled = await getEnabledPluginCss();
    expect(disabled).not.toContain(".late { color: green; }");
    expect(pluginCssVersion(disabled)).toBe(before);
  });

  test("registered script folders are listed and keep their source", () => {
    registerPluginScript("builtin-folder", "builtin");
    registerPluginScript("user-folder", "plugin");
    expect(getPluginScriptFolders()).toContain("user-folder");
    expect(getScriptFolderSource("builtin-folder")).toBe("builtin");
    expect(getScriptFolderSource("user-folder")).toBe("plugin");
    expect(getScriptFolderSource("unregistered")).toBeNull();
  });

  test("pruning drops css and scripts of removed plugin folders only", async () => {
    const root = await mkdtemp(join(tmpdir(), "degoog-assets-"));
    const kept = join(root, "kept-plugin");
    const gone = join(root, "gone-plugin");
    for (const dir of [kept, gone]) {
      await mkdir(dir);
      await writeFile(join(dir, "script.js"), "");
    }
    await writeFile(join(gone, "style.css"), ".gone-css { color: red; }");
    await writeFile(join(kept, "style.css"), ".kept-css { color: red; }");
    await loadPluginAssets(kept, "kept-plugin", "kept-plugin-slot");
    await loadPluginAssets(gone, "gone-plugin", "gone-plugin-slot");
    registerPluginScript("builtin-only", "builtin");

    await rm(gone, { recursive: true, force: true });
    prunePluginAssets(root);

    const css = await getEnabledPluginCss();
    expect(css).toContain(".kept-css");
    expect(css).not.toContain(".gone-css");
    expect(getScriptFolderSource("kept-plugin")).toBe("plugin");
    expect(getScriptFolderSource("gone-plugin")).toBeNull();
    expect(getScriptFolderSource("builtin-only")).toBe("builtin");
    await rm(root, { recursive: true, force: true });
  });
});

describe("plugin route identity", () => {
  const FOLDER = "degoog-org-official-extensions-jellyfin";

  test("buildRouteUrl joins paths and tolerates leading slashes", () => {
    expect(buildRouteUrl(FOLDER, "thumb")).toBe(`/api/plugin/${FOLDER}/thumb`);
    expect(buildRouteUrl(FOLDER, "/thumb")).toBe(`/api/plugin/${FOLDER}/thumb`);
    expect(buildRouteUrl(FOLDER)).toBe(`/api/plugin/${FOLDER}`);
  });

  test("initPlugin exposes pluginId/apiBase/routeUrl from folder, not settingsId", async () => {
    let captured: PluginContext | null = null;
    const plugin = {
      init: (ctx: PluginContext) => {
        captured = ctx;
      },
    };

    await initPlugin(plugin, "/tmp/whatever", "plugin-jellyfin", "", {
      pluginId: FOLDER,
    });

    expect(captured).not.toBeNull();
    const ctx = captured as unknown as PluginContext;
    expect(ctx.pluginId).toBe(FOLDER);
    expect(ctx.id).toBe(FOLDER);
    expect(ctx.apiBase).toBe(`/api/plugin/${FOLDER}`);
    expect(ctx.routeUrl("thumb")).toBe(`/api/plugin/${FOLDER}/thumb`);
    expect(ctx.pluginId).not.toBe("plugin-jellyfin");
  });
});
