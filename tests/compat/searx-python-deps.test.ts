import { describe, test, expect } from "bun:test";
import {
  SEARX_CATALOG,
  SEARX_SHARED_FILES,
  engineLibs,
  isSupportFile,
  isSupportedEngine,
} from "../../src/server/extensions/compatibility-layer/searx/catalog";
import { PythonLib } from "../../src/server/extensions/compatibility-layer/searx/python-deps";

describe("searx python libs", () => {
  test("engines inherit the libs their shared files import, and nothing more", () => {
    const cases: [string, PythonLib[]][] = [
      ["mwmbl", []],
      ["tagesschau", []],
      ["google_cse", [PythonLib.Babel, PythonLib.Lxml]],
      ["apple_maps", [PythonLib.Babel, PythonLib.DateUtil, PythonLib.Lxml]],
      ["boardreader", [PythonLib.Babel]],
      ["mojeek", [PythonLib.Babel, PythonLib.DateUtil, PythonLib.Lxml]],
    ];
    for (const [code, libs] of cases) {
      expect(engineLibs(code)).toEqual(libs);
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
      expect(isSupportFile(entry.code)).toBe(false);
      for (const dep of entry.deps ?? []) {
        expect(dep).not.toBe(entry.code);
        expect(codes.has(dep) || isSupportFile(dep)).toBe(true);
      }
    }
  });
});
