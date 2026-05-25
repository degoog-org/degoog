import { describe, test, expect } from "bun:test";
import {
  addPluginCss,
  getAllPluginCss,
  registerPluginScript,
  getPluginScriptFolders,
  getScriptFolderSource,
  buildApiBase,
  buildRouteUrl,
  initPlugin,
} from "../src/server/utils/plugin-assets";
import type { PluginContext } from "../src/server/types";

describe("plugin-assets", () => {
  test("addPluginCss and getAllPluginCss", () => {
    addPluginCss("p1", ".p1 { color: red; }");
    addPluginCss("p2", ".p2 { color: blue; }");
    const all = getAllPluginCss();
    expect(all).toContain(".p1 { color: red; }");
    expect(all).toContain(".p2 { color: blue; }");
  });

  test("registerPluginScript and getPluginScriptFolders", () => {
    registerPluginScript("my-plugin");
    const folders = getPluginScriptFolders();
    expect(folders).toContain("my-plugin");
  });

  test("getScriptFolderSource returns source for registered folders", () => {
    registerPluginScript("builtin-folder", "builtin");
    registerPluginScript("user-folder", "plugin");
    expect(getScriptFolderSource("builtin-folder")).toBe("builtin");
    expect(getScriptFolderSource("user-folder")).toBe("plugin");
    expect(getScriptFolderSource("unregistered")).toBeNull();
  });
});

describe("plugin route identity", () => {
  const FOLDER = "degoog-org-official-extensions-jellyfin";

  test("buildApiBase uses the installed folder ID", () => {
    expect(buildApiBase(FOLDER)).toBe(`/api/plugin/${FOLDER}`);
  });

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
