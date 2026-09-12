import { describe, test, expect, mock, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { setSettings } from "../../src/server/utils/plugin-settings";
import type { EngineRunReport, QueryInterceptor } from "../../src/server/types/extension";

const REGISTRY_MOD = "../../src/server/extensions/interceptors/registry";
const DISABLED_ID = "observer-off";

const dir = mkdtempSync(join(tmpdir(), "degoog-observers-"));
const prevSettingsFile = process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(dir, "plugin-settings.json");

const registryReal = await import(REGISTRY_MOD);
const { reportEngineRun } = await import("../../src/server/utils/run-observers");

const REPORT: EngineRunReport = {
  engine: "brave",
  engineId: "brave",
  searchType: "web",
  page: 1,
  time: 120,
  resultCount: 10,
  status: "ok",
  cached: false,
  at: 1_700_000_000_000,
};

const stubInterceptor = (extra: Partial<QueryInterceptor>): QueryInterceptor =>
  ({
    name: "stub",
    description: "stub",
    intercept: async (query: string) => ({ query }),
    ...extra,
  }) as QueryInterceptor;

const withRegistry = (interceptors: QueryInterceptor[]) => {
  mock.module(REGISTRY_MOD, () => ({
    ...registryReal,
    getInterceptors: () => interceptors,
  }));
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterAll(async () => {
  mock.module(REGISTRY_MOD, () => registryReal);
  await setSettings(DISABLED_ID, { disabled: "false" });
  if (prevSettingsFile === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
  else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prevSettingsFile;
  rmSync(dir, { recursive: true, force: true });
});

describe("reportEngineRun", () => {
  test("delivers the report to interceptors exposing observe", async () => {
    const seen: EngineRunReport[] = [];
    withRegistry([
      stubInterceptor({ settingsId: "observer-on", observe: (r) => void seen.push(r) }),
      stubInterceptor({ settingsId: "observer-plain" }),
    ]);

    reportEngineRun(REPORT);
    await settle();

    expect(seen).toHaveLength(1);
    expect(seen[0].engine).toBe("brave");
    expect(seen[0].cached).toBe(false);
  });

  test("skips interceptors disabled in settings", async () => {
    const seen: EngineRunReport[] = [];
    await setSettings(DISABLED_ID, { disabled: "true" });
    withRegistry([
      stubInterceptor({ settingsId: DISABLED_ID, observe: (r) => void seen.push(r) }),
    ]);

    reportEngineRun(REPORT);
    await settle();

    expect(seen).toHaveLength(0);
  });

  test("a throwing observer does not stop the next one", async () => {
    const seen: string[] = [];
    withRegistry([
      stubInterceptor({
        settingsId: "observer-boom",
        observe: () => {
          throw new Error("nope");
        },
      }),
      stubInterceptor({
        settingsId: "observer-fine",
        observe: () => void seen.push("fine"),
      }),
    ]);

    expect(() => reportEngineRun(REPORT)).not.toThrow();
    await settle();

    expect(seen).toEqual(["fine"]);
  });
});
