import { describe, test, expect, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  installSearx,
  listSearxItems,
  uninstallSearx,
  updateSearx,
} from "../../src/server/extensions/compatibility-layer/searx/install";
import {
  SEARX_CATALOG,
  isSupportFile,
  isSupportedEngine,
} from "../../src/server/extensions/compatibility-layer/searx/catalog";

const realFetch = globalThis.fetch;

const withEnginesDir = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-searx-install-"));
  const prev = process.env.DEGOOG_SEARX_ENGINES_DIR;
  process.env.DEGOOG_SEARX_ENGINES_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.DEGOOG_SEARX_ENGINES_DIR;
    else process.env.DEGOOG_SEARX_ENGINES_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
};

const stubFetch = (body: string, status = 200): string[] => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/engine_traits.json")) return Response.json({});
    calls.push(url);
    return new Response(body, { status });
  }) as typeof fetch;
  return calls;
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("searx install layer", () => {
  test("catalogue only exposes verified engines and degoog types", () => {
    expect(SEARX_CATALOG.length).toBeGreaterThan(0);
    for (const entry of SEARX_CATALOG) {
      expect(entry.types.length).toBeGreaterThan(0);
      expect(entry.types).not.toContain("general");
    }
  });

  test("support files are never offered or loaded as engines", () => {
    const codes = new Set(SEARX_CATALOG.map((entry) => entry.code));
    for (const entry of SEARX_CATALOG) {
      expect(isSupportFile(entry.code)).toBe(false);
      for (const dep of entry.deps ?? []) {
        expect(dep).not.toBe(entry.code);
        if (codes.has(dep)) continue;
        expect(isSupportFile(dep)).toBe(true);
        expect(isSupportedEngine(dep)).toBe(false);
      }
    }
  });

  test("reports installed state from the engines dir", async () => {
    await withEnginesDir(async (dir) => {
      const code = SEARX_CATALOG[0].code;
      writeFileSync(join(dir, `${code}.py`), "");
      const items = await listSearxItems();
      expect(items.find((item) => item.code === code)?.installed).toBe(true);
      expect(items.filter((item) => item.installed)).toHaveLength(1);
    });
  });

  test("installs an engine by pulling its python source", async () => {
    await withEnginesDir(async (dir) => {
      const calls = stubFetch("def request(query, params):\n    return params\n");
      await installSearx("mojeek");
      expect(calls[0]).toBe(
        "https://raw.githubusercontent.com/searxng/searxng/master/searx/engines/mojeek.py",
      );
      expect(existsSync(join(dir, "mojeek.py"))).toBe(true);
    });
  });

  test("leaves nothing behind when the download fails", async () => {
    await withEnginesDir(async (dir) => {
      stubFetch("nope", 404);
      await expect(installSearx("mojeek")).rejects.toThrow("HTTP 404");
      expect(existsSync(join(dir, "mojeek.py"))).toBe(false);
    });
  });

  test("uninstall removes the file and is a no-op when absent", async () => {
    await withEnginesDir(async (dir) => {
      writeFileSync(join(dir, "mojeek.py"), "");
      await uninstallSearx("mojeek");
      expect(existsSync(join(dir, "mojeek.py"))).toBe(false);
      await uninstallSearx("mojeek");
    });
  });

  test("pulls shared dependency files before the engine itself", async () => {
    await withEnginesDir(async (dir) => {
      const calls = stubFetch("def request(query, params):\n    return params\n");
      await installSearx("google_cse");
      expect(calls).toHaveLength(2);
      expect(calls[0]).toContain("/google.py");
      expect(calls[1]).toContain("/google_cse.py");
      expect(existsSync(join(dir, "google.py"))).toBe(true);
      expect(existsSync(join(dir, "google_cse.py"))).toBe(true);
    });
  });

  test("reports only the dependencies that are still missing", async () => {
    await withEnginesDir(async (dir) => {
      const before = await listSearxItems();
      expect(before.find((item) => item.code === "google_cse")?.missingDeps).toEqual([
        "google",
      ]);
      writeFileSync(join(dir, "google.py"), "");
      const after = await listSearxItems();
      expect(after.find((item) => item.code === "google_cse")?.missingDeps).toEqual([]);
      expect(after.find((item) => item.code === "mojeek")?.missingDeps).toEqual([]);
    });
  });

  test("shared files are dropped once nothing else needs them", async () => {
    await withEnginesDir(async (dir) => {
      stubFetch("def request(query, params):\n    return params\n");
      await installSearx("google_cse");
      await installSearx("google_images");
      await uninstallSearx("google_cse");
      expect(existsSync(join(dir, "google.py"))).toBe(true);
      await uninstallSearx("google_images");
      expect(existsSync(join(dir, "google.py"))).toBe(false);
    });
  });

  test("uninstall keeps shared files that are catalogue engines too", async () => {
    await withEnginesDir(async (dir) => {
      stubFetch("def request(query, params):\n    return params\n");
      await installSearx("bing_videos");
      await uninstallSearx("bing_videos");
      expect(existsSync(join(dir, "bing_images.py"))).toBe(true);
      expect(existsSync(join(dir, "bing.py"))).toBe(true);
    });
  });

  test("update re-pulls the engine source over the installed copy", async () => {
    await withEnginesDir(async (dir) => {
      writeFileSync(join(dir, "mojeek.py"), "stale");
      const calls = stubFetch("fresh");
      await updateSearx("mojeek");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("/mojeek.py");
      expect(await Bun.file(join(dir, "mojeek.py")).text()).toBe("fresh");
    });
  });

  test("update refreshes shared dependency files that are already there", async () => {
    await withEnginesDir(async (dir) => {
      stubFetch("def request(query, params):\n    return params\n");
      await installSearx("google_cse");
      const calls = stubFetch("fresher");
      await updateSearx("google_cse");
      expect(calls).toHaveLength(2);
      expect(calls[0]).toContain("/google.py");
      expect(await Bun.file(join(dir, "google.py")).text()).toBe("fresher");
    });
  });

  test("update leaves the installed copy alone when the download fails", async () => {
    await withEnginesDir(async (dir) => {
      writeFileSync(join(dir, "mojeek.py"), "stale");
      stubFetch("nope", 500);
      await expect(updateSearx("mojeek")).rejects.toThrow("HTTP 500");
      expect(await Bun.file(join(dir, "mojeek.py")).text()).toBe("stale");
    });
  });

  test("update refuses engines that are not installed", async () => {
    await withEnginesDir(async () => {
      await expect(updateSearx("mojeek")).rejects.toThrow("not installed");
    });
  });

  test("rejects codes outside the catalogue", async () => {
    await withEnginesDir(async () => {
      await expect(installSearx("../../etc/passwd")).rejects.toThrow("Unknown SearX engine");
      await expect(uninstallSearx("not_an_engine")).rejects.toThrow("Unknown SearX engine");
      await expect(updateSearx("not_an_engine")).rejects.toThrow("Unknown SearX engine");
    });
  });
});
