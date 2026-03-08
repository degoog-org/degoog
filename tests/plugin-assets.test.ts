import { describe, test, expect } from "bun:test";
import {
  addPluginCss,
  getAllPluginCss,
  registerPluginScript,
  getPluginScriptFolders,
  getScriptFolderSource,
} from "../src/plugin-assets";

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
