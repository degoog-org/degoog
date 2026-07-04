import { describe, test, expect, afterEach } from "bun:test";
import { isDockerRuntime } from "../../src/server/utils/server-lifecycle";

describe("isDockerRuntime", () => {
  afterEach(() => {
    delete process.env.DEGOOG_DOCKER;
  });

  test("is false on a plain non-Docker host", () => {
    delete process.env.DEGOOG_DOCKER;
    expect(isDockerRuntime()).toBe(false);
  });

  test("is true when DEGOOG_DOCKER is set truthy", () => {
    process.env.DEGOOG_DOCKER = "true";
    expect(isDockerRuntime()).toBe(true);
  });

  test("is false when DEGOOG_DOCKER is set falsy", () => {
    process.env.DEGOOG_DOCKER = "false";
    expect(isDockerRuntime()).toBe(false);
  });
});
