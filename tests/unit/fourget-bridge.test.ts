import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  runBridge,
  type RpcFetchRequest,
  type RunnerSpec,
} from "../../src/server/extensions/compatibility-layer/rpc";
import {
  phpBinary,
  phpStatus,
} from "../../src/server/extensions/compatibility-layer/fourget/php-runtime";
import { FOURGET_PAGES } from "../../src/server/extensions/compatibility-layer/fourget/pages";

const runnerPath = join(
  import.meta.dir,
  "../../src/server/extensions/compatibility-layer/fourget/runner.php",
);

const FAKE_LIB = `<?php

class backend {
	public $scraper;
	public function __construct($scraper){
		$this->scraper = $scraper;
	}
	public function store($payload, $page, $proxy){
		$id = apcu_inc("requestid");
		apcu_store($page[0] . "." . $this->scraper . $id, [$payload, $proxy], 900);
		return $this->scraper . $id;
	}
	public function get($npt, $page){
		$held = apcu_fetch($page[0] . "." . $npt);
		if($held === false){
			throw new Exception("The next page token is invalid or has expired!");
		}
		apcu_delete($page[0] . "." . $npt);
		return $held;
	}
}
`;

const FAKE_SCRAPER = `<?php

class demo {

	public function __construct(){
		include "lib/backend.php";
		$this->backend = new backend("demo");
	}

	public function getfilters($page){
		if($page !== "web"){
			return [];
		}
		return [
			"country" => ["display" => "Country", "option" => ["us" => "US", "fr" => "France"]],
			"nsfw" => ["display" => "NSFW", "option" => ["yes" => "Yes", "no" => "No"]],
			"newer" => ["display" => "Newer", "option" => "_DATE"]
		];
	}

	public function web($get){

		$seen = [];
		$curl = curl_init();
		curl_setopt($curl, CURLOPT_URL, "https://example.invalid/search?q=" . urlencode($get["s"]));
		curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
		if($get["s"] === "follow"){
			curl_setopt($curl, CURLOPT_FOLLOWLOCATION, true);
		}
		curl_setopt($curl, CURLOPT_HTTPHEADER, ["User-Agent: " . config::USER_AGENT, "Accept: text/html"]);
		curl_setopt($curl, CURLOPT_HEADERFUNCTION, function($handle, $line) use (&$seen){
			$seen[] = trim($line);
			return strlen($line);
		});

		$body = curl_exec($curl);
		$code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
		curl_close($curl);

		if($body === false){
			throw new Exception("fetch blew up: " . curl_error($curl));
		}

		$page = $get["npt"] === false ? 1 : (int)$this->backend->get($get["npt"], "web")[0];

		return [
			"status" => "ok",
			"npt" => $this->backend->store((string)($page + 1), "web", "raw_ip::::"),
			"answer" => [],
			"web" => [[
				"title" => "page " . $page . " " . $get["country"] . " " . $get["nsfw"],
				"description" => trim($body) . " http=" . $code . " headers=" . count($seen) . " seen=" . implode("|", $seen),
				"url" => "https://example.invalid/result/" . $page,
				"thumb" => ["url" => "https://example.invalid/thumb.png", "ratio" => "16:9"]
			]],
			"image" => [], "video" => [], "news" => [],
			"related" => ["more like this"]
		];
	}

	public function image($get){
		return [
			"status" => "ok", "npt" => null, "answer" => [], "web" => [],
			"image" => [[
				"title" => "a picture",
				"url" => "https://example.invalid/page",
				"source" => [
					["url" => "https://example.invalid/big.jpg", "width" => 800, "height" => 600],
					["url" => "https://example.invalid/small.jpg", "width" => 80, "height" => 60]
				]
			]],
			"video" => [], "news" => [], "related" => []
		];
	}
}
`;

const SPEC: RunnerSpec = {
  bin: phpBinary(),
  args: ["-d", "display_errors=stderr", "-d", "html_errors=0"],
  label: "4get",
};

let root = "";
const cache = new Map<string, string>();

const usable = await phpStatus()
  .then((status) => status.ok)
  .catch(() => false);

const basePayload = (): Record<string, unknown> => ({
  root: join(root, ".run"),
  libs: [{ code: "backend", src: join(root, "lib", "backend.php") }],
  scrapers: [{ code: "demo", src: join(root, "scraper", "demo.php") }],
  pages: FOURGET_PAGES,
  config: { USER_AGENT: "degoog-test-agent", PROXY_DEMO: false },
  apiKeys: {},
});

const handlers = (seen: RpcFetchRequest[], body = "hello") => ({
  onFetch: async (req: RpcFetchRequest) => {
    seen.push(req);
    return {
      url: req.url,
      status: 200,
      headers: { "content-type": "text/html", "x-demo": "1" },
      cookies: {},
      text: body,
    };
  },
  onCache: async (req: { op: "get" | "set"; key: string; value?: string }) => {
    if (req.op === "set") {
      cache.set(req.key, req.value ?? "");
      return null;
    }
    const held = cache.get(req.key);
    return held === undefined || held === "" ? null : held;
  },
});

beforeAll(() => {
  if (!usable) return;
  root = mkdtempSync(join(tmpdir(), "degoog-4get-bridge-"));
  mkdirSync(join(root, "lib"), { recursive: true });
  mkdirSync(join(root, "scraper"), { recursive: true });
  writeFileSync(join(root, "lib", "backend.php"), FAKE_LIB);
  writeFileSync(join(root, "scraper", "demo.php"), FAKE_SCRAPER);
});

afterAll(() => {
  if (!root) return;
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    root = "";
  }
});

const maybe = usable ? test : test.skip;

interface DiscoverResult {
  engines: { code: string; types: string[]; filters: Record<string, unknown>; error?: string }[];
}

interface SearchResult {
  results: { title: string; url: string; snippet: string; thumbnail?: string; imageUrl?: string }[];
  npt: string | null;
  related: string[];
}

describe("4get php bridge", () => {
  maybe("discovery reflects the methods a scraper actually has", async () => {
    const out = await runBridge<DiscoverResult>(SPEC, runnerPath, {
      ...basePayload(),
      action: "discover",
      codes: ["demo"],
    });
    const demo = out.engines[0];
    expect(demo.error).toBeUndefined();
    expect(demo.types).toEqual(["web", "images"]);
    expect(Object.keys(demo.filters.web as object)).toContain("country");
  });

  maybe("the scraper's curl call comes out through degoog's fetch", async () => {
    const seen: RpcFetchRequest[] = [];
    await runBridge<SearchResult>(
      SPEC,
      runnerPath,
      { ...basePayload(), action: "search", code: "demo", type: "web", query: "cats", npt: false, source: "Demo" },
      handlers(seen),
    );
    expect(seen.length).toBe(1);
    expect(seen[0].url).toContain("q=cats");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].follow).toBe(false);
    expect(seen[0].headers["User-Agent"]).toBe("degoog-test-agent");
    expect(seen[0].headers.Accept).toBe("text/html");
  });

  maybe("CURLOPT_FOLLOWLOCATION is forwarded so degoog can honor it", async () => {
    const seen: RpcFetchRequest[] = [];
    await runBridge<SearchResult>(
      SPEC,
      runnerPath,
      { ...basePayload(), action: "search", code: "demo", type: "web", query: "follow", npt: false, source: "Demo" },
      handlers(seen),
    );
    expect(seen[0].follow).toBe(true);
  });

  maybe("set-cookie from a 302 is replayed into CURLOPT_HEADERFUNCTION", async () => {
    const out = await runBridge<SearchResult>(
      SPEC,
      runnerPath,
      { ...basePayload(), action: "search", code: "demo", type: "web", query: "cats", npt: false, source: "Demo" },
      {
        onFetch: async (req: RpcFetchRequest) => ({
          url: req.url,
          status: 302,
          headers: { location: "https://example.invalid/next" },
          cookies: { "techaro.lol-anubis-cookie": "token" },
          text: "",
        }),
        onCache: handlers([]).onCache,
      },
    );
    expect(out.results[0].snippet).toContain("http=302");
    expect(out.results[0].snippet).toContain("techaro.lol-anubis-cookie=token");
  });

  maybe("response headers are replayed into CURLOPT_HEADERFUNCTION", async () => {
    const out = await runBridge<SearchResult>(
      SPEC,
      runnerPath,
      { ...basePayload(), action: "search", code: "demo", type: "web", query: "cats", npt: false, source: "Demo" },
      handlers([]),
    );
    expect(out.results[0].snippet).toContain("http=200");
    expect(out.results[0].snippet).toContain("headers=4");
  });

  maybe("results come back already shaped for degoog", async () => {
    const out = await runBridge<SearchResult>(
      SPEC,
      runnerPath,
      { ...basePayload(), action: "search", code: "demo", type: "web", query: "cats", npt: false, source: "Demo" },
      handlers([]),
    );
    expect(out.results[0].url).toBe("https://example.invalid/result/1");
    expect(out.results[0].thumbnail).toBe("https://example.invalid/thumb.png");
    expect(out.related).toEqual(["more like this"]);
  });

  maybe("image results use the biggest source and keep the thumbnail", async () => {
    const out = await runBridge<SearchResult>(
      SPEC,
      runnerPath,
      { ...basePayload(), action: "search", code: "demo", type: "images", query: "cats", npt: false, source: "Demo" },
      handlers([]),
    );
    expect(out.results[0].imageUrl).toBe("https://example.invalid/big.jpg");
    expect(out.results[0].thumbnail).toBe("https://example.invalid/small.jpg");
  });

  maybe("engine settings reach the scraper as 4get filter values", async () => {
    const out = await runBridge<SearchResult>(
      SPEC,
      runnerPath,
      {
        ...basePayload(),
        action: "search",
        code: "demo",
        type: "web",
        query: "cats",
        npt: false,
        source: "Demo",
        overrides: { country: "fr" },
        nsfw: "no",
      },
      handlers([]),
    );
    expect(out.results[0].title).toBe("page 1 fr no");
  });

  maybe("an unknown override is ignored rather than passed through", async () => {
    const out = await runBridge<SearchResult>(
      SPEC,
      runnerPath,
      {
        ...basePayload(),
        action: "search",
        code: "demo",
        type: "web",
        query: "cats",
        npt: false,
        source: "Demo",
        overrides: { country: "not-an-option" },
      },
      handlers([]),
    );
    expect(out.results[0].title).toBe("page 1 us yes");
  });

  maybe("a next page token survives into a whole new process", async () => {
    cache.clear();
    const first = await runBridge<SearchResult>(
      SPEC,
      runnerPath,
      { ...basePayload(), action: "search", code: "demo", type: "web", query: "cats", npt: false, source: "Demo" },
      handlers([]),
    );
    expect(first.npt).toBeTruthy();
    const second = await runBridge<SearchResult>(
      SPEC,
      runnerPath,
      { ...basePayload(), action: "search", code: "demo", type: "web", query: "cats", npt: first.npt, source: "Demo" },
      handlers([]),
    );
    expect(second.results[0].title).toContain("page 2");
    expect(second.npt).not.toBe(first.npt);
  });

  maybe("a token the cache has forgotten fails the way 4get expects", async () => {
    cache.clear();
    await expect(
      runBridge<SearchResult>(
        SPEC,
        runnerPath,
        { ...basePayload(), action: "search", code: "demo", type: "web", query: "cats", npt: "demo999", source: "Demo" },
        handlers([]),
      ),
    ).rejects.toThrow("expired");
  });

  maybe("a type the scraper has no method for is refused", async () => {
    await expect(
      runBridge<SearchResult>(
        SPEC,
        runnerPath,
        { ...basePayload(), action: "search", code: "demo", type: "news", query: "cats", npt: false, source: "Demo" },
        handlers([]),
      ),
    ).rejects.toThrow("no news results");
  });

  maybe("two scrapers in one process do not redeclare the shared lib", async () => {
    writeFileSync(
      join(root, "scraper", "second.php"),
      FAKE_SCRAPER.replace("class demo", "class second"),
    );
    const payload = basePayload();
    const out = await runBridge<DiscoverResult>(SPEC, runnerPath, {
      ...payload,
      scrapers: [
        ...(payload.scrapers as unknown[]),
        { code: "second", src: join(root, "scraper", "second.php") },
      ],
      action: "discover",
      codes: ["demo", "second"],
    });
    expect(out.engines.length).toBe(2);
    for (const engine of out.engines) expect(engine.error).toBeUndefined();
  });
});
