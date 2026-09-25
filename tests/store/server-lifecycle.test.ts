import { describe, test, expect, afterEach } from "bun:test";
import { isDockerRuntime } from "../../src/server/utils/server-lifecycle";

describe("isDockerRuntime", () => {
  afterEach(() => {
    delete process.env.DEGOOG_DOCKER;
  });

  test("follows DEGOOG_DOCKER truthiness", () => {
    process.env.DEGOOG_DOCKER = "true";
    expect(isDockerRuntime()).toBe(true);
    process.env.DEGOOG_DOCKER = "false";
    expect(isDockerRuntime()).toBe(false);
  });
});
