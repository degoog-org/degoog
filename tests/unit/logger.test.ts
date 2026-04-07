import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { logger } from "../../src/server/utils/logger";

describe("logger", () => {
  const orig = process.env.LOG_LEVEL;

  beforeEach(() => {
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    if (orig !== undefined) process.env.LOG_LEVEL = orig;
  });

  test("debug does not throw when LOG_LEVEL is not set", () => {
    expect(() => logger.debug("ctx", "msg")).not.toThrow();
  });

  test("debug does not throw when LOG_LEVEL=debug", () => {
    process.env.LOG_LEVEL = "debug";
    expect(() => logger.debug("ctx", "msg")).not.toThrow();
  });

  test("debug does not throw when LOG_LEVEL=warning", () => {
    process.env.LOG_LEVEL = "warning";
    expect(() => logger.debug("ctx", "msg")).not.toThrow();
  });

  test("debug does not throw when LOG_LEVEL=error", () => {
    process.env.LOG_LEVEL = "error";
    expect(() => logger.debug("ctx", "msg")).not.toThrow();
  });

  test("debug does not throw when LOG_LEVEL=fatal", () => {
    process.env.LOG_LEVEL = "fatal";
    expect(() => logger.debug("ctx", "msg")).not.toThrow();
  });

  test("debug accepts optional error", () => {
    expect(() => logger.debug("ctx", "msg", new Error("e"))).not.toThrow();
  });
});
