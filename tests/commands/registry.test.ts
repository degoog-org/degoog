import { describe, test, expect, beforeAll } from "bun:test";
import {
  initPlugins,
  getCommandInstanceById,
  getCommandRegistry,
  matchBangCommand,
} from "../../src/server/extensions/commands/registry";

describe("commands registry", () => {
  beforeAll(async () => {
    const { initEngines } =
      await import("../../src/server/extensions/engines/registry");
    const origPlugins = process.env.DEGOOG_PLUGINS_DIR;
    const origEngines = process.env.DEGOOG_ENGINES_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-plugins-dir";
    process.env.DEGOOG_ENGINES_DIR = "/nonexistent-engines-dir";
    await initEngines();
    await initPlugins();
    if (origPlugins !== undefined) process.env.DEGOOG_PLUGINS_DIR = origPlugins;
    else delete process.env.DEGOOG_PLUGINS_DIR;
    if (origEngines !== undefined) process.env.DEGOOG_ENGINES_DIR = origEngines;
    else delete process.env.DEGOOG_ENGINES_DIR;
  });

  test("getCommandInstanceById returns help command by -command id", () => {
    const cmd = getCommandInstanceById("help-command");
    expect(cmd).toBeDefined();
    expect(cmd!.trigger).toBe("help");
  });

  test("matchBangCommand parses leading and trailing bangs", () => {
    const leading = matchBangCommand("!help trailing text");
    expect(leading?.type).toBe("command");
    if (leading?.type === "command") {
      expect(leading.command.trigger).toBe("help");
      expect(leading.args).toBe("trailing text");
    }

    const trailing = matchBangCommand("some query !help");
    expect(trailing?.type).toBe("command");
    if (trailing?.type === "command") {
      expect(trailing.command.trigger).toBe("help");
      expect(trailing.args).toBe("some query");
    }
  });

  test("matchBangCommand returns null without a standalone bang", () => {
    expect(matchBangCommand("help")).toBeNull();
    expect(matchBangCommand("foo!help")).toBeNull();
  });

  test("loaded commands have no duplicate triggers", () => {
    const reg = getCommandRegistry();
    const builtinTriggers = reg
      .filter((c) => c.category !== "Engine shortcuts")
      .map((c) => c.trigger);
    const unique = new Set(builtinTriggers);
    expect(unique.size).toBe(builtinTriggers.length);
  });
});
