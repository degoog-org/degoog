import { describe, test, expect } from "bun:test";
import {
  SEARX_CATALOG,
  SEARX_SHARED_FILES,
  engineLibs,
  isSupportFile,
  isSupportedEngine,
} from "../../src/server/extensions/compatibility-layer/searx/catalog";
import {
  LIB_PACKAGES,
  PythonLib,
} from "../../src/server/extensions/compatibility-layer/searx/python-deps";

describe("searx python libs", () => {
  test("engines without third party imports need nothing", () => {
    expect(engineLibs("mwmbl")).toEqual([]);
    expect(engineLibs("tagesschau")).toEqual([]);
  });

  test("engines inherit the libs their shared files import", () => {
    expect(engineLibs("google_cse")).toEqual([PythonLib.Babel, PythonLib.Lxml]);
    expect(engineLibs("apple_maps")).toEqual([
      PythonLib.Babel,
      PythonLib.DateUtil,
      PythonLib.Lxml,
    ]);
    expect(engineLibs("boardreader")).toEqual([PythonLib.Babel]);
    expect(engineLibs("mojeek")).toEqual([
      PythonLib.Babel,
      PythonLib.DateUtil,
      PythonLib.Lxml,
    ]);
  });

  test("every lib has an installable package name", () => {
    for (const lib of Object.values(PythonLib)) {
      expect(LIB_PACKAGES[lib]).toBeTruthy();
    }
  });

  test("shared files are declared, never offered as engines", () => {
    const codes = new Set(SEARX_CATALOG.map((entry) => entry.code));
    for (const file of SEARX_SHARED_FILES) {
      expect(codes.has(file.code)).toBe(false);
      expect(isSupportFile(file.code)).toBe(true);
      expect(isSupportedEngine(file.code)).toBe(false);
    }
    for (const entry of SEARX_CATALOG) {
      expect(isSupportedEngine(entry.code)).toBe(true);
      for (const dep of entry.deps ?? []) {
        expect(codes.has(dep) || isSupportFile(dep)).toBe(true);
      }
    }
  });
});
