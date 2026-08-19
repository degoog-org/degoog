import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearServerSettingsCache } from "../../src/server/utils/server-settings";
import { clearTypeCache } from "../../src/server/extensions/engines/registry";

const withSearxEnv = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(join(tmpdir(), "degoog-searx-compat-"));
  const prev = {
    dataDir: process.env.DEGOOG_DATA_DIR,
    enginesDir: process.env.DEGOOG_ENGINES_DIR,
    transportsDir: process.env.DEGOOG_TRANSPORTS_DIR,
    settingsFile: process.env.DEGOOG_PLUGIN_SETTINGS_FILE,
    serverSettingsFile: process.env.DEGOOG_SERVER_SETTINGS_FILE,
    searxDir: process.env.DEGOOG_SEARX_ENGINES_DIR,
    extraEngines: process.env.DEGOOG_SEARX_EXTRA_ENGINES,
  };
  process.env.DEGOOG_DATA_DIR = dir;
  process.env.DEGOOG_ENGINES_DIR = join(dir, "engines");
  process.env.DEGOOG_TRANSPORTS_DIR = join(dir, "transports");
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE = join(dir, "plugin-settings.json");
  process.env.DEGOOG_SERVER_SETTINGS_FILE = join(dir, "server-settings.json");
  delete process.env.DEGOOG_SEARX_ENGINES_DIR;
  process.env.DEGOOG_SEARX_EXTRA_ENGINES =
    "tiny,statics,pager,traits,capped,knobs,needy";
  mkdirSync(process.env.DEGOOG_ENGINES_DIR, { recursive: true });
  mkdirSync(process.env.DEGOOG_TRANSPORTS_DIR, { recursive: true });
  mkdirSync(join(dir, "searx", "engines"), { recursive: true });
  writeFileSync(process.env.DEGOOG_PLUGIN_SETTINGS_FILE, "{}");
  writeFileSync(
    process.env.DEGOOG_SERVER_SETTINGS_FILE,
    JSON.stringify({
      settings: { degoogIndexerEnabled: false, searxCompatEnabled: true },
    }),
  );
  clearServerSettingsCache();
  clearTypeCache();
  try {
    return await fn(dir);
  } finally {
    if (prev.dataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = prev.dataDir;
    if (prev.enginesDir === undefined) delete process.env.DEGOOG_ENGINES_DIR;
    else process.env.DEGOOG_ENGINES_DIR = prev.enginesDir;
    if (prev.transportsDir === undefined) delete process.env.DEGOOG_TRANSPORTS_DIR;
    else process.env.DEGOOG_TRANSPORTS_DIR = prev.transportsDir;
    if (prev.settingsFile === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
    else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prev.settingsFile;
    if (prev.serverSettingsFile === undefined) delete process.env.DEGOOG_SERVER_SETTINGS_FILE;
    else process.env.DEGOOG_SERVER_SETTINGS_FILE = prev.serverSettingsFile;
    if (prev.searxDir === undefined) delete process.env.DEGOOG_SEARX_ENGINES_DIR;
    else process.env.DEGOOG_SEARX_ENGINES_DIR = prev.searxDir;
    if (prev.extraEngines === undefined) delete process.env.DEGOOG_SEARX_EXTRA_ENGINES;
    else process.env.DEGOOG_SEARX_EXTRA_ENGINES = prev.extraEngines;
    clearServerSettingsCache();
    clearTypeCache();
    rmSync(dir, { recursive: true, force: true });
  }
};

const writeTinyEngine = (dir: string): void => {
  writeFileSync(
    join(dir, "searx", "engines", "tiny.py"),
    `from urllib.parse import urlencode
from searx.result_types import EngineResults

about = {"website": "https://example.com"}
base_url = None
categories = ["general", "web"]
paging = True

def request(query, params):
    params["url"] = base_url + "/search?" + urlencode({"q": query, "p": params["pageno"]})
    params["headers"]["Accept"] = "text/html"
    params["cookies"]["CONSENT"] = "YES+"

def response(resp):
    results = EngineResults()
    results.append({"url": "https://result.test/", "title": "Result title", "content": "from compat"})
    return results
`,
  );
};

const writeEngine = (dir: string, name: string, body: string): void => {
  writeFileSync(join(dir, "searx", "engines", `${name}.py`), body);
};

const STATIC_ENGINE = `about = {"website": "https://static.example"}
base_url = "https://static.example"
categories = ["images"]
paging = False
time_range_support = False

def request(query, params):
    params["url"] = base_url + "/?q=" + query

def response(resp):
    return [{"url": "https://static.example/a", "title": "hit", "content": "c"}]
`;

const PAGER_ENGINE = `about = {"website": "https://pager.example"}
base_url = "https://pager.example"
categories = ["general"]
paging = True
time_range_support = True

def request(query, params):
    params["url"] = base_url + "/?q=" + query + "&range=" + str(params["time_range"]) + "&safe=" + str(params["safesearch"])

def response(resp):
    return [{"url": "https://pager.example/a", "title": "hit", "content": "c"}]
`;

const CAPPED_ENGINE = `about = {"website": "https://capped.example"}
base_url = "https://capped.example"
categories = ["general"]
paging = True
max_page = 4

def request(query, params):
    params["url"] = base_url + "/?q=" + query

def response(resp):
    return [{"url": "https://capped.example/a", "title": "hit", "content": "c"}]
`;

const CACHING_ENGINE = `about = {"website": "https://cache.example"}
base_url = "https://cache.example"
categories = ["general"]
paging = True

def request(query, params):
    token = CACHE.get("token")
    if token is None:
        token = {"id": "abc", "n": 1}
        CACHE.set("token", token)
    params["url"] = base_url + "/?id=" + token["id"] + "&n=" + str(token["n"])

def response(resp):
    return [{"url": "https://cache.example/a", "title": "hit", "content": "c"}]
`;

const TRAITS_ENGINE = `about = {"website": "https://traits.example"}
base_url = "https://traits.example"
categories = ["general"]
paging = False

def request(query, params):
    lang = traits.get_language(params["searxng_locale"], "lang_en")
    region = traits.get_region(params["searxng_locale"], traits.all_locale)
    host = traits.custom["supported_domains"].get(str(region).upper(), "fallback.example")
    params["url"] = base_url + "/?lang=" + str(lang) + "&region=" + str(region) + "&host=" + host

def response(resp):
    return [{"url": "https://traits.example/a", "title": "hit", "content": "c"}]
`;

const TRAITS_FILE = JSON.stringify({
  languages: { de: "lang_de" },
  regions: { "de-DE": "DE" },
  all_locale: "ZZ",
  custom: { supported_domains: { DE: "www.example.de", ZZ: "www.example.com" } },
});

const writeTraits = (dir: string, name: string, body: string): void => {
  writeFileSync(join(dir, "searx", "engines", `${name}.traits.json`), body);
};

const okFetch = async (): Promise<Response> =>
  new Response("<html></html>", { status: 200 });

const KNOBS_ENGINE = `import typing

about = {"website": "https://knobs.example"}
base_url = "https://knobs.example"
categories = ["general"]
paging = False

api_key = ""
"""Token handed out by :py:obj:\`knobs\`."""

region = "us"
"""Region used for the query."""

result_count = 10
"""How many results to ask for."""

strip_ads = True

mode: typing.Literal["fast", "deep"] = "fast"
"""Search depth."""

def request(query, params):
    params["url"] = (
        base_url + "/?q=" + query + "&key=" + api_key + "&region=" + region
        + "&n=" + str(result_count) + "&ads=" + str(strip_ads) + "&mode=" + mode
    )

def response(resp):
    return [{"url": "https://knobs.example/a", "title": "hit", "content": "c"}]
`;

const NEEDY_ENGINE = `about = {}
base_url = None
"""Instance this engine talks to."""
categories = ["general"]
paging = False

def request(query, params):
    params["url"] = base_url + "/?q=" + query

def response(resp):
    return [{"url": "https://needy.example/a", "title": "hit", "content": "c"}]
`;

describe("SearX engine parity with native engines", () => {
  test("engines that cannot page return nothing past page one", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "statics", STATIC_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const engine = getEngineMap()["searx-statics-engine"];
      const first = await engine.executeSearch("q", 1, "any", { fetch: okFetch });
      const second = await engine.executeSearch("q", 2, "any", { fetch: okFetch });
      expect(first.length).toBe(1);
      expect(second).toEqual([]);
    });
  });

  test("engines declare their page ceiling through the pagination context", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "statics", STATIC_ENGINE);
      writeEngine(dir, "pager", PAGER_ENGINE);
      writeEngine(dir, "capped", CAPPED_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const declared: (number | undefined)[] = [];
      const pagination = (info: { total?: number }): void => {
        declared.push(info.total);
      };

      await getEngineMap()["searx-statics-engine"].executeSearch("q", 1, "any", {
        fetch: okFetch,
        pagination,
      });
      expect(declared).toEqual([1]);

      declared.length = 0;
      await getEngineMap()["searx-pager-engine"].executeSearch("q", 1, "any", {
        fetch: okFetch,
        pagination,
      });
      expect(declared).toEqual([]);

      declared.length = 0;
      await getEngineMap()["searx-capped-engine"].executeSearch("q", 1, "any", {
        fetch: okFetch,
        pagination,
      });
      expect(declared).toEqual([4]);
    });
  });

  test("safe search defaults follow the engine type and stay configurable", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "statics", STATIC_ENGINE);
      writeEngine(dir, "pager", PAGER_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const images = getEngineMap()["searx-statics-engine"];
      const web = getEngineMap()["searx-pager-engine"];
      expect((images as unknown as { safeSearch: string }).safeSearch).toBe("moderate");
      expect((web as unknown as { safeSearch: string }).safeSearch).toBe("off");
      expect((web.settingsSchema ?? []).map((f) => f.key)).toContain("safeSearch");
      web.configure?.({ safeSearch: "strict" });
      expect((web as unknown as { safeSearch: string }).safeSearch).toBe("strict");
    });
  });

  test("time filters reach engines that support them and are withheld from those that do not", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "statics", STATIC_ENGINE);
      writeEngine(dir, "pager", PAGER_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      let seen = "";
      const capture = async (url: string): Promise<Response> => {
        seen = url;
        return new Response("<html></html>", { status: 200 });
      };
      await getEngineMap()["searx-pager-engine"].executeSearch("q", 1, "week", {
        fetch: capture,
      });
      expect(seen).toContain("range=week");
      await getEngineMap()["searx-statics-engine"].executeSearch("q", 1, "week", {
        fetch: capture,
      });
      expect(seen).not.toContain("range=week");
    });
  });

  test("cached values survive the trip back into a fresh engine process", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "pager", CACHING_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const engine = getEngineMap()["searx-pager-engine"];
      const seen: string[] = [];
      const capture = async (url: string): Promise<Response> => {
        seen.push(url);
        return new Response("<html></html>", { status: 200 });
      };
      await engine.executeSearch("q", 1, "any", { fetch: capture });
      await engine.executeSearch("q", 1, "any", { fetch: capture });
      expect(seen[0]).toContain("id=abc&n=1");
      expect(seen[1]).toBe(seen[0]);
    });
  });

  test("engine traits are loaded from the sidecar traits file", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "traits", TRAITS_ENGINE);
      writeTraits(dir, "traits", TRAITS_FILE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      let seen = "";
      await getEngineMap()["searx-traits-engine"].executeSearch("q", 1, "any", {
        lang: "de-DE",
        fetch: async (url: string) => {
          seen = url;
          return new Response("<html></html>", { status: 200 });
        },
      });
      expect(seen).toBe(
        "https://traits.example/?lang=lang_de&region=DE&host=www.example.de",
      );
    });
  });

  test("a custom date range collapses onto the nearest supported bucket", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "pager", PAGER_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      let seen = "";
      await getEngineMap()["searx-pager-engine"].executeSearch("q", 1, "custom", {
        dateFrom: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        fetch: async (url: string) => {
          seen = url;
          return new Response("<html></html>", { status: 200 });
        },
      });
      expect(seen).toContain("range=week");
    });
  });
});

describe("SearX engine configuration", () => {
  test("engine knobs land in the settings schema as typed fields", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "knobs", KNOBS_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const schema = getEngineMap()["searx-knobs-engine"].settingsSchema ?? [];
      const field = (key: string) => schema.find((f) => f.key === key);

      expect(field("searxOpt_api_key")?.type).toBe("password");
      expect(field("searxOpt_api_key")?.secret).toBe(true);
      expect(field("searxOpt_api_key")?.description).toBe("Token handed out by knobs.");
      expect(field("searxOpt_region")?.type).toBe("text");
      expect(field("searxOpt_region")?.default).toBe("us");
      expect(field("searxOpt_result_count")?.type).toBe("number");
      expect(field("searxOpt_result_count")?.default).toBe("10");
      expect(field("searxOpt_strip_ads")?.type).toBe("toggle");
      expect(field("searxOpt_strip_ads")?.default).toBe("true");
      expect(field("searxOpt_mode")?.type).toBe("select");
      expect(field("searxOpt_mode")?.options).toEqual(["fast", "deep"]);
      expect(field("searxOpt_base_url")?.label).toBe("Base URL");
      expect(field("categories")).toBeUndefined();
      expect(field("searxOpt_paging")).toBeUndefined();
    });
  });

  test("stored settings reach the python engine on every search", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "knobs", KNOBS_ENGINE);
      const { setSettings } = await import(
        "../../src/server/utils/plugin-settings"
      );
      await setSettings("searx-knobs-engine", {
        searxOpt_api_key: "s3cret",
        searxOpt_region: "de",
        searxOpt_result_count: "42",
        searxOpt_strip_ads: "false",
        searxOpt_mode: "deep",
      });
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      let seen = "";
      await getEngineMap()["searx-knobs-engine"].executeSearch("q", 1, "any", {
        fetch: async (url: string) => {
          seen = url;
          return new Response("<html></html>", { status: 200 });
        },
      });
      expect(seen).toBe(
        "https://knobs.example/?q=q&key=s3cret&region=de&n=42&ads=False&mode=deep",
      );
    });
  });

  test("saving settings retunes the live engine without a reload", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "knobs", KNOBS_ENGINE);
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const engine = getEngineMap()["searx-knobs-engine"];
      engine.configure?.({ searxOpt_region: "fr" });
      let seen = "";
      await engine.executeSearch("q", 1, "any", {
        fetch: async (url: string) => {
          seen = url;
          return new Response("<html></html>", { status: 200 });
        },
      });
      expect(seen).toContain("region=fr");
    });
  });

  test("an unset knob marks the engine as needing configuration", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "needy", NEEDY_ENGINE);
      writeEngine(dir, "pager", PAGER_ENGINE);
      const { initEngines, getEngineMap, getDefaultEngineConfig } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const schema = getEngineMap()["searx-needy-engine"].settingsSchema ?? [];
      const baseUrl = schema.find((f) => f.key === "searxOpt_base_url");
      expect(baseUrl?.required).toBe(true);
      expect(baseUrl?.description).toBe("Instance this engine talks to.");
      expect(getDefaultEngineConfig()["searx-needy-engine"]).toBe(false);
      expect(getDefaultEngineConfig()["searx-pager-engine"]).toBe(true);
    });
  });

  test("a configured instance url brings the engine back to life", async () => {
    await withSearxEnv(async (dir) => {
      writeEngine(dir, "needy", NEEDY_ENGINE);
      const { setSettings } = await import(
        "../../src/server/utils/plugin-settings"
      );
      await setSettings("searx-needy-engine", {
        searxOpt_base_url: "https://mine.example",
      });
      const { initEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      let seen = "";
      await getEngineMap()["searx-needy-engine"].executeSearch("q", 1, "any", {
        fetch: async (url: string) => {
          seen = url;
          return new Response("<html></html>", { status: 200 });
        },
      });
      expect(seen).toBe("https://mine.example/?q=q");
    });
  });
});

describe("SearX compatibility layer", () => {
  test("loads mounted Python engines from data/extensions/searx/engines", async () => {
    await withSearxEnv(async (dir) => {
      writeTinyEngine(dir);
      const { initEngines, listEngines, getEngineMap } = await import(
        "../../src/server/extensions/engines/registry"
      );
      await initEngines(true);
      const engines = await listEngines();
      const meta = engines.find((engine) => engine.id === "searx-tiny-engine");
      expect(meta?.displayName).toBe("Tiny");
      expect(meta?.searchTypes).toContain("web");
      const engine = getEngineMap()["searx-tiny-engine"];
      expect(engine.bangShortcut).toBe("tiny");
      const results = await engine.executeSearch("hello", 2, "any", {
        userAgent: () => "DegoogUA/1.0",
        buildAcceptLanguage: () => "it-IT,it;q=0.9",
        fetch: async (url, init) => {
          expect(url).toBe("https://example.com/search?q=hello&p=2");
          expect(init?.headers?.["User-Agent"]).toBe("DegoogUA/1.0");
          expect(init?.headers?.["Accept-Language"]).toBe("it-IT,it;q=0.9");
          expect(init?.headers?.Accept).toBe("text/html");
          expect(init?.headers?.Cookie).toBe("CONSENT=YES+");
          return new Response("<a class='result' href='https://result.test/'>Result title</a>", {
            status: 200,
          });
        },
      });
      expect(results).toEqual([
        {
          title: "Result title",
          url: "https://result.test/",
          snippet: "from compat",
          source: "Tiny",
        },
      ]);
    });
  });

  test("scrubs control characters out of bridge log messages", async () => {
    const { scrubLog } = await import(
      "../../src/server/extensions/compatibility-layer/searx/index"
    );
    const forged = "ftp://evil.test/x\r\nWARN searx-compat forged line\u0000";
    expect(scrubLog(forged)).toBe("ftp://evil.test/xWARN searx-compat forged line");
    expect(scrubLog("https://example.com/search?q=hi")).toBe(
      "https://example.com/search?q=hi",
    );
  });
});
