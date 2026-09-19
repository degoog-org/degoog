import { describe, test, expect, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  installFourGet,
  listFourGetItems,
  uninstallFourGet,
  updateFourGet,
} from "../../src/server/extensions/compatibility-layer/fourget/install";
import {
  FOURGET_CATALOG,
  FOURGET_SHARED_FILES,
  catalogDeps,
  isKnownScraper,
  isSharedFile,
  scraperUrl,
  sharedUrl,
} from "../../src/server/extensions/compatibility-layer/fourget/catalog";

const realFetch = globalThis.fetch;

const PHP_BODY = "<?php\n\nclass stub{}\n";

const withFourGetDir = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-4get-install-"));
  const prev = process.env.DEGOOG_FOURGET_DIR;
  process.env.DEGOOG_FOURGET_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.DEGOOG_FOURGET_DIR;
    else process.env.DEGOOG_FOURGET_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
};

const stubFetch = (body = PHP_BODY, status = 200): string[] => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(body, { status });
  }) as typeof fetch;
  return calls;
};

const seed = (dir: string, kind: "scraper" | "lib", code: string): void => {
  mkdirSync(join(dir, kind), { recursive: true });
  writeFileSync(join(dir, kind, `${code}.php`), PHP_BODY);
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("4get catalogue", () => {
  test("every entry names a type and a unique code", () => {
    const seen = new Set<string>();
    expect(FOURGET_CATALOG.length).toBeGreaterThan(0);
    for (const entry of FOURGET_CATALOG) {
      expect(entry.types.length).toBeGreaterThan(0);
      expect(seen.has(entry.code)).toBe(false);
      seen.add(entry.code);
    }
  });

  test("shared libs are never offered as scrapers", () => {
    for (const entry of FOURGET_CATALOG) {
      expect(isSharedFile(entry.code)).toBe(false);
      for (const dep of entry.deps ?? []) {
        expect(FOURGET_SHARED_FILES).toContain(dep);
      }
    }
  });

  test("every catalogued scraper depends on backend", () => {
    for (const entry of FOURGET_CATALOG) {
      expect(catalogDeps(entry.code)).toContain("backend");
    }
  });

  test("unknown codes are rejected unless the env var lets them through", () => {
    const saved = process.env.DEGOOG_FOURGET_EXTRA_SCRAPERS;
    expect(isKnownScraper("ddg")).toBe(true);
    expect(isKnownScraper("definitely-not-real")).toBe(false);
    process.env.DEGOOG_FOURGET_EXTRA_SCRAPERS = "definitely-not-real, spare";
    try {
      expect(isKnownScraper("definitely-not-real")).toBe(true);
      expect(isKnownScraper("spare")).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.DEGOOG_FOURGET_EXTRA_SCRAPERS;
      else process.env.DEGOOG_FOURGET_EXTRA_SCRAPERS = saved;
    }
  });

  test("the env var cannot smuggle a path out of the scraper directory", () => {
    const saved = process.env.DEGOOG_FOURGET_EXTRA_SCRAPERS;
    process.env.DEGOOG_FOURGET_EXTRA_SCRAPERS = "../../../etc/passwd, ../ddg, a/b";
    try {
      expect(isKnownScraper("../../../etc/passwd")).toBe(false);
      expect(isKnownScraper("../ddg")).toBe(false);
      expect(isKnownScraper("a/b")).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.DEGOOG_FOURGET_EXTRA_SCRAPERS;
      else process.env.DEGOOG_FOURGET_EXTRA_SCRAPERS = saved;
    }
  });

  test("urls point at the upstream gitea raw paths", () => {
    expect(scraperUrl("ddg")).toBe(
      "https://git.lolcat.ca/lolcat/4get/raw/branch/master/scraper/ddg.php",
    );
    expect(sharedUrl("backend")).toBe(
      "https://git.lolcat.ca/lolcat/4get/raw/branch/master/lib/backend.php",
    );
  });
});

describe("4get install layer", () => {
  test("installing pulls the scraper and the libs it is missing", async () => {
    await withFourGetDir(async (dir) => {
      const calls = stubFetch();
      await installFourGet("ddg");
      expect(existsSync(join(dir, "scraper", "ddg.php"))).toBe(true);
      expect(existsSync(join(dir, "lib", "backend.php"))).toBe(true);
      expect(existsSync(join(dir, "lib", "fuckhtml.php"))).toBe(true);
      expect(calls.some((url) => url.endsWith("/scraper/ddg.php"))).toBe(true);
    });
  });

  test("a lib already on disk is not downloaded again", async () => {
    await withFourGetDir(async (dir) => {
      seed(dir, "lib", "backend");
      seed(dir, "lib", "fuckhtml");
      const calls = stubFetch();
      await installFourGet("ddg");
      expect(calls.filter((url) => url.includes("/lib/")).length).toBe(0);
    });
  });

  test("updating re-pulls the scraper and all of its declared libs", async () => {
    await withFourGetDir(async (dir) => {
      seed(dir, "scraper", "ddg");
      seed(dir, "lib", "backend");
      seed(dir, "lib", "fuckhtml");
      const calls = stubFetch();
      await updateFourGet("ddg");
      expect(calls.filter((url) => url.includes("/lib/")).length).toBe(2);
      expect(calls.some((url) => url.endsWith("/scraper/ddg.php"))).toBe(true);
    });
  });

  test("updating something that is not installed is refused", async () => {
    await withFourGetDir(async () => {
      stubFetch();
      await expect(updateFourGet("ddg")).rejects.toThrow("not installed");
    });
  });

  test("a failed download leaves the installed copy alone", async () => {
    await withFourGetDir(async (dir) => {
      seed(dir, "scraper", "wiby");
      seed(dir, "lib", "backend");
      stubFetch("nope", 500);
      await expect(updateFourGet("wiby")).rejects.toThrow();
      expect(existsSync(join(dir, "scraper", "wiby.php"))).toBe(true);
    });
  });

  test("a download that is not php is refused", async () => {
    await withFourGetDir(async (dir) => {
      stubFetch("<html>404</html>");
      await expect(installFourGet("wiby")).rejects.toThrow("not php");
      expect(existsSync(join(dir, "scraper", "wiby.php"))).toBe(false);
    });
  });

  test("a redirect off the 4get host is refused", async () => {
    await withFourGetDir(async (dir) => {
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.redirect).toBe("manual");
        return new Response("", {
          status: 302,
          headers: { Location: "http://127.0.0.1/evil.php" },
        });
      }) as typeof fetch;
      await expect(installFourGet("wiby")).rejects.toThrow("off-host");
      expect(existsSync(join(dir, "scraper", "wiby.php"))).toBe(false);
    });
  });

  test("a same-host https redirect is followed", async () => {
    await withFourGetDir(async (dir) => {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.redirect).toBe("manual");
        const url = String(input);
        if (!url.includes("followed=1")) {
          return new Response("", {
            status: 302,
            headers: { Location: `${url}?followed=1` },
          });
        }
        return new Response(PHP_BODY);
      }) as typeof fetch;
      await installFourGet("wiby");
      expect(existsSync(join(dir, "scraper", "wiby.php"))).toBe(true);
    });
  });

  test("uninstalling drops libs nothing else still wants", async () => {
    await withFourGetDir(async (dir) => {
      seed(dir, "scraper", "wiby");
      seed(dir, "lib", "backend");
      await uninstallFourGet("wiby");
      expect(existsSync(join(dir, "scraper", "wiby.php"))).toBe(false);
      expect(existsSync(join(dir, "lib", "backend.php"))).toBe(false);
    });
  });

  test("uninstalling keeps libs another scraper still depends on", async () => {
    await withFourGetDir(async (dir) => {
      seed(dir, "scraper", "wiby");
      seed(dir, "scraper", "ddg");
      seed(dir, "lib", "backend");
      seed(dir, "lib", "fuckhtml");
      await uninstallFourGet("wiby");
      expect(existsSync(join(dir, "lib", "backend.php"))).toBe(true);
      expect(existsSync(join(dir, "lib", "fuckhtml.php"))).toBe(true);
    });
  });

  test("the catalogue listing reports what is on disk", async () => {
    await withFourGetDir(async (dir) => {
      seed(dir, "scraper", "wiby");
      const items = await listFourGetItems();
      const wiby = items.find((item) => item.code === "wiby");
      const ddg = items.find((item) => item.code === "ddg");
      expect(wiby?.installed).toBe(true);
      expect(ddg?.installed).toBe(false);
      expect(ddg?.missingDeps).toContain("backend");
    });
  });

  test("scrapers that need a key or impersonation say so", async () => {
    await withFourGetDir(async () => {
      const items = await listFourGetItems();
      expect(items.find((item) => item.code === "mojeek")?.notes).toContain(
        "needs-api-key",
      );
      expect(items.find((item) => item.code === "yep")?.notes).toContain(
        "wants-impersonation",
      );
    });
  });
});
