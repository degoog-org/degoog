import { describe, test, expect, beforeAll } from "bun:test";
import { helpCommand } from "../../src/server/extensions/commands/builtins/help/index";
import { ipCommand } from "../../src/server/extensions/commands/builtins/ip/index";
import { speedtestCommand } from "../../src/server/extensions/commands/builtins/speedtest/index";
import { uuidCommand } from "../../src/server/extensions/commands/builtins/uuid/index";

describe("commands builtins", () => {
  beforeAll(async () => {
    const { initPlugins } =
      await import("../../src/server/extensions/commands/registry");
    const { initEngines } =
      await import("../../src/server/extensions/engines/registry");
    const orig = process.env.DEGOOG_PLUGINS_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent";
    process.env.DEGOOG_ENGINES_DIR = "/nonexistent";
    await initEngines();
    await initPlugins();
    if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
    else delete process.env.DEGOOG_PLUGINS_DIR;
    delete process.env.DEGOOG_ENGINES_DIR;
  });

  test("helpCommand.execute returns title and html with command list", async () => {
    const result = await helpCommand.execute("");
    expect(result.title).toBe("Available Commands");
    expect(result.html).toContain("help-container");
    expect(result.html).toContain("!help");
  });

  test("uuidCommand.execute returns title and html with UUIDs", async () => {
    const result = await uuidCommand.execute("");
    expect(result.title).toBe("Generated UUIDs");
    expect(result.html).toContain("uuid-value");
    const uuidMatch = result.html.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(uuidMatch).not.toBeNull();
  });

  test("helpCommand keeps its tabs, search box and script without a context", async () => {
    const noContext = await helpCommand.execute("");
    const emptyContext = await helpCommand.execute("", {});
    for (const html of [noContext.html, emptyContext.html]) {
      expect(html).toContain("help-search-input");
      expect(html).toContain("help-tabs");
      expect(html).toContain("help-tab ");
      expect(html).toContain("<script");
    }
  });

  test("helpCommand drops the tabs and search box under nojs", async () => {
    const result = await helpCommand.execute("", { nojs: true });
    expect(result.title).toBe("Available Commands");
    expect(result.html).toContain("help-container");
    expect(result.html).toContain("!help");
    expect(result.html).not.toContain("help-search-input");
    expect(result.html).not.toContain("help-tab");
    expect(result.html).not.toContain("<script");
  });

  test("helpCommand expands every panel under nojs", async () => {
    const plain = await helpCommand.execute("", {});
    const nojs = await helpCommand.execute("", { nojs: true });
    const panels = (html: string): number =>
      (html.match(/class="help-panel["\s]/g) ?? []).length;
    const active = (html: string): number =>
      (html.match(/class="help-panel active"/g) ?? []).length;
    expect(panels(nojs.html)).toBe(panels(plain.html));
    expect(panels(nojs.html)).toBeGreaterThan(1);
    expect(active(nojs.html)).toBe(panels(nojs.html));
    expect(active(plain.html)).toBe(1);
  });

  test("ipCommand keeps its detection script without a context", async () => {
    const noContext = await ipCommand.execute("");
    const localContext = await ipCommand.execute("", { clientIp: "127.0.0.1" });
    for (const result of [noContext, localContext]) {
      expect(result.html).toContain("<script");
      expect(result.html).toContain("api.ipify.org");
    }
  });

  test("ipCommand emits no script under nojs", async () => {
    const result = await ipCommand.execute("", {
      clientIp: "127.0.0.1",
      nojs: true,
    });
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("api.ipify.org");
    expect(result.html).toContain("ip-detect-root");
  });

  test("uuidCommand keeps its copy button without a context", async () => {
    const noContext = await uuidCommand.execute("2");
    const emptyContext = await uuidCommand.execute("2", {});
    for (const result of [noContext, emptyContext]) {
      expect(result.html).toContain("uuid-copy");
      expect(result.html.split("uuid-value").length - 1).toBe(2);
    }
  });

  test("uuidCommand drops the copy button under nojs", async () => {
    const result = await uuidCommand.execute("2", { nojs: true });
    expect(result.html).not.toContain("uuid-copy");
    expect(result.html.split("uuid-value").length - 1).toBe(2);
  });

  test("builtins declare their nojs support", () => {
    expect(helpCommand.supportsNojs).toBe(true);
    expect(ipCommand.supportsNojs).toBe(true);
    expect(uuidCommand.supportsNojs).toBe(true);
    expect(speedtestCommand.supportsNojs).toBeUndefined();
  });

  test("speedtestCommand still returns its browser side widget", async () => {
    const result = await speedtestCommand.execute("");
    expect(result.html).toContain("<script");
  });
});
