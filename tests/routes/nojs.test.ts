import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  SlotPanelPosition,
  type BangCommand,
  type CommandContext,
  type EngineTiming,
  type ScoredResult,
  type SearchParams,
  type SearchResponse,
  type SlotPlugin,
  type SlotPluginContext,
} from "../../src/server/types";
import { readdir } from "fs/promises";
import { locateById } from "../../src/server/nojs/dom";
import {
  loadNojsTemplate,
  NOJS_TEMPLATE_NAMES,
} from "../../src/server/nojs/templates";
import type { BangMatch } from "../../src/server/extensions/commands/registry";
import { helpCommand } from "../../src/server/extensions/commands/builtins/help/index";
import { ipCommand } from "../../src/server/extensions/commands/builtins/ip/index";
import { speedtestCommand } from "../../src/server/extensions/commands/builtins/speedtest/index";
import { uuidCommand } from "../../src/server/extensions/commands/builtins/uuid/index";

const SERVER_SETTINGS_MOD = "../../src/server/utils/server-settings";
const SEARCH_HANDLERS_MOD = "../../src/server/routes/search/_search-handlers";
const TAB_SEARCH_MOD = "../../src/server/routes/search/_tab-search-handler";

const serverSettingsReal = { ...(await import(SERVER_SETTINGS_MOD)) };
const searchHandlersReal = { ...(await import(SEARCH_HANDLERS_MOD)) };
const tabSearchReal = { ...(await import(TAB_SEARCH_MOD)) };

const PLACEHOLDERS = [
  "__NOJS_",
  "__PAGE_CONTENT__",
  "__BODY_CLASS__",
  "__THEME_CSS__",
  "__CUSTOM_CSS__",
  "__CSS_PING__",
  "__LANG_ATTR__",
  "__THEME_ATTRS__",
  "__RTL_SUPPORT__",
  "__APP_VERSION__",
];

const LOGO_LETTERS = [
  "logo-d",
  "logo-e",
  "logo-g1",
  "logo-o1",
  "logo-o2",
  "logo-g2",
];

const INLINE_HANDLER_RE = /<[^>]*\son[a-z]+\s*=/i;

const sliceById = (html: string, id: string): string => {
  const span = locateById(html, id);
  if (!span) throw new Error(`no element with id ${id} in the rendered page`);
  return html.slice(span.innerStart, span.innerEnd);
};

const makeResult = (over: Partial<ScoredResult> = {}): ScoredResult => ({
  title: "First result",
  url: "https://example.test/one",
  snippet: "First snippet text",
  source: "Fake",
  score: 1,
  sources: ["Fake"],
  ...over,
});

const makeResponse = (
  results: ScoredResult[],
  totalPages = 1,
  engineTimings: EngineTiming[] = [],
): SearchResponse => ({
  results,
  query: "hello",
  totalTime: 12,
  type: "web",
  engineTimings,
  relatedSearches: [],
  totalPages,
});

interface Harness {
  settings?: Record<string, unknown>;
  results?: ScoredResult[];
  totalPages?: number;
  engineTimings?: EngineTiming[];
}

const searchParamsSeen: SearchParams[] = [];
const retryParamsSeen: (SearchParams & { engineName: string })[] = [];
const tabSearchSeen: string[] = [];

const harness = ({
  settings = {},
  results = [],
  totalPages = 1,
  engineTimings = [],
}: Harness = {}): void => {
  searchParamsSeen.length = 0;
  retryParamsSeen.length = 0;
  tabSearchSeen.length = 0;
  mock.module(SERVER_SETTINGS_MOD, () => ({
    ...serverSettingsReal,
    getInstanceSettings: async () => settings,
  }));
  mock.module(SEARCH_HANDLERS_MOD, () => ({
    ...searchHandlersReal,
    handleSearch: async (params: SearchParams) => {
      searchParamsSeen.push(params);
      return makeResponse(results, totalPages, engineTimings);
    },
    handleRetry: async (params: SearchParams & { engineName: string }) => {
      retryParamsSeen.push(params);
      return {
        query: params.query,
        type: params.searchType,
        totalTime: 7,
        relatedSearches: [],
        timing: { name: params.engineName, time: 7, resultCount: results.length },
        engineTimings,
        results,
      };
    },
  }));
  mock.module(TAB_SEARCH_MOD, () => ({
    ...tabSearchReal,
    handleTabSearch: async ({ tabId }: { tabId: string }) => {
      tabSearchSeen.push(tabId);
      return {
        results,
        totalPages,
        page: 1,
        engineTimings,
        totalTime: 5,
      };
    },
  }));
};

const enabled = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  nojsEnabled: "true",
  ...extra,
});

const call = async (path: string, init?: RequestInit): Promise<Response> => {
  const router = (await import("../../src/server/nojs/router")).default;
  return router.request(new Request(`http://localhost${path}`, init));
};

const text = async (path: string, init?: RequestInit): Promise<string> => {
  const res = await call(path, init);
  expect(res.status).toBe(200);
  return res.text();
};

afterEach(() => {
  mock.module(SERVER_SETTINGS_MOD, () => serverSettingsReal);
  mock.module(SEARCH_HANDLERS_MOD, () => searchHandlersReal);
  mock.module(TAB_SEARCH_MOD, () => tabSearchReal);
});

describe("nojs is invisible unless it is turned on", () => {
  test("GET /nojs is 404 when nojsEnabled is absent", async () => {
    harness();
    const res = await call("/nojs");
    expect(res.status).toBe(404);
  });

  test("GET /nojs/search is 404 when nojsEnabled is absent", async () => {
    harness();
    const res = await call("/nojs/search?q=x");
    expect(res.status).toBe(404);
  });

  test("GET /nojs is 404 when nojsEnabled is false", async () => {
    harness({ settings: { nojsEnabled: "false" } });
    const res = await call("/nojs");
    expect(res.status).toBe(404);
  });

  test("GET /nojs/search is 404 when nojsEnabled is false", async () => {
    harness({ settings: { nojsEnabled: "false" } });
    const res = await call("/nojs/search?q=x");
    expect(res.status).toBe(404);
  });
});

describe("nojs home page", () => {
  test("renders a search form targeting the nojs search path", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    expect(html).toContain("<form");
    expect(html).toContain('action="/nojs/search"');
    expect(html).toContain('name="q"');
  });

  test("renders all six logo letter spans", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    for (const letter of LOGO_LETTERS) {
      expect(html).toContain(letter);
    }
  });

  test("renders a full html document", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("</html>");
  });

  test("reuses the theme shell and its home search partial", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    expect(html).toContain('id="app"');
    expect(html).toContain('id="header"');
    expect(html).toContain('id="main-home"');
    expect(html).toContain('id="home-logo"');
    expect(html).toContain('id="home-search"');
    expect(html).toContain('id="home-footer"');
    expect(html).toContain('id="search-form-home"');
    expect(html).toContain('id="search-bar-home"');
    expect(html).toContain('id="search-input"');
    expect(html).toContain('id="btn-search"');
  });

  test("drops the controls that cannot work without javascript", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    expect(html).not.toContain('id="btn-lucky"');
    expect(html).not.toContain("lucky-slot-inner");
  });

  test("renders the binary logo with the monospace class on every letter", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    const logo = sliceById(html, "home-logo");
    expect(logo).toContain("00100100");
    expect(logo).toContain("00101111");
    for (const letter of LOGO_LETTERS) {
      expect(logo).toContain(`${letter} logo-letter nojs-logo-letter`);
    }
    expect(logo.match(/nojs-logo-letter/g)?.length).toBe(LOGO_LETTERS.length);
  });
});

describe("nojs pages ship no javascript", () => {
  test("home page has no script tag and no inline handlers", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    expect(html).not.toContain("<script");
    expect(INLINE_HANDLER_RE.test(html)).toBe(false);
  });

  test("search page has no script tag and no inline handlers", async () => {
    harness({
      settings: enabled(),
      results: [makeResult(), makeResult({ title: "Second", url: "https://example.test/two" })],
    });
    const html = await text("/nojs/search?q=hello");
    expect(html).not.toContain("<script");
    expect(INLINE_HANDLER_RE.test(html)).toBe(false);
  });
});

describe("nojs pages leave no placeholders behind", () => {
  test("home page resolves every placeholder and template marker", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    for (const placeholder of PLACEHOLDERS) {
      expect(html).not.toContain(placeholder);
    }
    expect(html).not.toContain("{{t:");
    expect(html).not.toContain("{{ ");
  });

  test("search page resolves every placeholder and template marker", async () => {
    harness({
      settings: enabled(),
      results: [makeResult()],
      totalPages: 3,
    });
    const html = await text("/nojs/search?q=hello");
    for (const placeholder of PLACEHOLDERS) {
      expect(html).not.toContain(placeholder);
    }
    expect(html).not.toContain("{{t:");
    expect(html).not.toContain("{{ ");
  });
});

describe("nojs search results", () => {
  test("renders both result titles, urls and snippets", async () => {
    harness({
      settings: enabled(),
      results: [
        makeResult(),
        makeResult({
          title: "Second result",
          url: "https://example.test/two",
          snippet: "Second snippet text",
        }),
      ],
    });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("First result");
    expect(html).toContain("Second result");
    expect(html).toContain('href="https://example.test/one"');
    expect(html).toContain('href="https://example.test/two"');
    expect(html).toContain("First snippet text");
    expect(html).toContain("Second snippet text");
  });

  test("keeps the submitted query in the header input", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain('value="hello"');
  });

  test("reports no results when the search returns nothing", async () => {
    harness({ settings: enabled(), results: [] });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("No results found.");
  });
});

describe("nojs result url sanitisation", () => {
  test("a javascript: result url never reaches an href", async () => {
    harness({
      settings: enabled(),
      results: [
        makeResult({ title: "Evil", url: "javascript:alert(1)" }),
        makeResult({ title: "Evil tabbed", url: "java\tscript:alert(1)" }),
        makeResult({ title: "Evil spaced", url: " javascript:alert(1)" }),
        makeResult({ title: "Evil cased", url: "JaVaScRiPt:alert(1)" }),
      ],
    });
    const html = await text("/nojs/search?q=hello");
    expect(html.toLowerCase()).not.toContain('href="javascript:');
    expect(html.toLowerCase()).not.toContain("href='javascript:");
    expect(/href\s*=\s*["']?\s*javascript:/i.test(html)).toBe(false);
    expect(html).toContain("Evil");
  });

  test("a data: result url never reaches an href", async () => {
    harness({
      settings: enabled(),
      results: [
        makeResult({
          title: "Data uri",
          url: "data:text/html;base64,PHNjcmlwdD4=",
        }),
      ],
    });
    const html = await text("/nojs/search?q=hello");
    expect(/href\s*=\s*["']?\s*data:/i.test(html)).toBe(false);
  });

  test("an ordinary https result url is kept", async () => {
    harness({
      settings: enabled(),
      results: [makeResult({ url: "https://keep.test/page?a=1" })],
    });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain('href="https://keep.test/page?a=1"');
  });
});

describe("nojs html escaping", () => {
  test("a markup title is escaped rather than rendered", async () => {
    harness({
      settings: enabled(),
      results: [
        makeResult({
          title: "<img src=x onerror=alert(1)>",
          snippet: "<b>bold</b>",
        }),
      ],
    });
    const html = await text("/nojs/search?q=hello");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  test("a markup query is escaped in the header input", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=%22%3E%3Cimg%20src%3Dx%3E");
    expect(html).not.toContain('"><img src=x>');
    expect(html).toContain("&quot;&gt;&lt;img src=x&gt;");
  });
});

describe("nojs search without a query", () => {
  test("missing q redirects to the nojs home", async () => {
    harness({ settings: enabled() });
    const res = await call("/nojs/search");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/nojs");
  });

  test("blank q redirects to the nojs home", async () => {
    harness({ settings: enabled() });
    const res = await call("/nojs/search?q=%20%20");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/nojs");
  });
});

describe("nojs has no theme switcher", () => {
  test("the theme route is gone", async () => {
    harness({ settings: enabled() });
    const res = await call("/nojs/theme?mode=dark&back=/nojs");
    expect(res.status).toBe(404);
  });

  test("the footer carries no theme links", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    expect(html).not.toContain("/nojs/theme");
    expect(html).not.toContain(">Light<");
    expect(html).not.toContain(">Dark<");
    expect(html).not.toContain(">Auto<");
  });

  test("the instance default theme still drives data-theme", async () => {
    harness({ settings: enabled({ defaultTheme: "dark" }) });
    const html = await text("/nojs");
    expect(html).toContain('data-theme="dark"');
  });

  test("no instance default leaves prefers-color-scheme in charge", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    expect(html).not.toContain("data-theme=");
  });
});

describe("nojs footer", () => {
  test("carries the version, repo, docs and full app links", async () => {
    harness({ settings: enabled() });
    const html = await text("/nojs");
    expect(html).toContain("home-footer-bottom");
    expect(html).toContain("home-footer-separator");
    expect(html).toContain("home-footer-version");
    expect(html).toContain(
      'href="https://github.com/degoog-org/degoog/releases/tag/',
    );
    expect(html).toContain('href="https://github.com/degoog-org/degoog"');
    expect(html).toContain('href="https://degoog-org.github.io/docs"');
    expect(html).toContain("Full version");
  });

  test("the search page gets the same footer", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("home-footer-bottom");
    expect(html).toContain("Full version");
    expect(html).not.toContain("/nojs/theme");
  });
});

describe("nojs results layout matches the real page", () => {
  test("renders the sidebar column inside the results layout", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain('id="results-layout"');
    expect(html).toContain('id="results-main"');
    expect(html).toContain('id="sidebar-col"');
    expect(html).toContain('id="results-sidebar"');
    expect(html.indexOf('id="results-main"')).toBeLessThan(
      html.indexOf('id="sidebar-col"'),
    );
  });

  test("keeps every container the real search shell ships", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    for (const id of [
      "results-page",
      "results-header",
      "results-meta",
      "slot-full-width-above-results",
      "at-a-glance",
      "slot-above-results",
      "slot-below-results",
      "slot-above-sidebar",
      "slot-below-sidebar",
      "sidebar-col",
      "media-preview-panel",
      "image-filters-bar",
      "img-lightbox",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  test("the results logo letters carry the monospace class", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    const header = sliceById(html, "results-header");
    for (const letter of LOGO_LETTERS) {
      expect(header).toContain(`${letter} logo-letter nojs-logo-letter`);
    }
  });

  test("wraps the inherited search bar in a real form", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    const header = sliceById(html, "results-header");
    expect(header).toContain(
      '<form class="nojs-results-form" action="/nojs/search" method="get" role="search">',
    );
    expect(header).toContain('id="results-search-bar"');
    expect(header).toContain('name="q"');
    expect(header).toContain('value="hello"');
    expect(header).toContain('id="results-search-btn" type="submit"');
    expect(header).not.toContain('id="results-search-clear-btn"');
  });

  test("the result card keeps the markup the real theme ships", async () => {
    harness({
      settings: enabled(),
      results: [
        makeResult({
          insecure: true,
          url: "http://example.test/one",
          thumbnail: "https://pics.test/thumb.jpg",
          duration: "3:21",
        }),
      ],
    });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("result-favicon degoog-result--favicon");
    expect(html).toContain("/api/proxy/favicon?domain=example.test");
    expect(html).toContain('data-favicon-host="example.test"');
    expect(html).toContain("result-insecure-badge");
    expect(html).toContain("unencrypted HTTP connection");
    expect(html).toContain("degoog-result--video-play");
    expect(html).toContain("degoog-result--video-duration");
    expect(html).not.toContain("result-actions-toggle");
    expect(html).not.toContain("result-actions-menu");
  });

  test("an engine tag recalled from the index carries a tooltip", async () => {
    harness({
      settings: enabled(),
      results: [makeResult({ idx: "recalled", sources: ["Degoog"] })],
    });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain('data-tooltip="From your index"');
  });

  test("the tools toggle sits inside the tab row", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    const tabs = html.slice(
      html.indexOf('id="results-tabs"'),
      html.indexOf("</summary>"),
    );
    expect(tabs).toContain('class="tools-wrap" id="tools-bar"');
    expect(tabs).toContain("tools-toggle");
    expect(tabs).toContain("tools-toggle-label");
  });

  test("the tools panel follows the tab row as a sibling", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain('id="tools-panel"');
    expect(html).toContain("tools-panel");
    expect(html).toContain("tools-date-apply");
    expect(html.indexOf("</summary>")).toBeLessThan(
      html.indexOf('id="tools-panel"'),
    );
  });

  test("an active filter opens the details element", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const open = await text("/nojs/search?q=hello&time=week");
    expect(open).toContain("<details open>");
    const closed = await text("/nojs/search?q=hello");
    expect(closed).toContain("<details>");
  });
});

describe("nojs engine breakdown", () => {
  const timings: EngineTiming[] = [
    { name: "Fake", id: "fake-engine", time: 40, resultCount: 3 },
    {
      name: "Broken",
      id: "broken-engine",
      time: 12,
      resultCount: 0,
      status: "blocked",
    },
  ];

  test("renders one row per engine in the sidebar", async () => {
    harness({ settings: enabled(), results: [makeResult()], engineTimings: timings });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("engine-performance-panel");
    expect(html).toContain("Engine Performance");
    expect(html).toContain("engine-stat-row");
    expect(html).toContain("engine-stat-info");
    expect(html).toContain("engine-stat-label degoog-text");
    expect(html).toContain(
      "engine-stat-meta degoog-text degoog-text--sm degoog-text--secondary",
    );
    expect(html).toContain("Fake");
    expect(html).toContain("Broken");
    expect(html).toContain("40ms");
  });

  test("marks a failed engine and explains why", async () => {
    harness({ settings: enabled(), results: [makeResult()], engineTimings: timings });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("engine-stat-row engine-failed");
    expect(html).toContain("engine-stat-reason");
    expect(html).toContain("Blocked by the engine");
  });

  test("uses details and summary so it opens without javascript", async () => {
    harness({ settings: enabled(), results: [makeResult()], engineTimings: timings });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("sidebar-accordion");
    expect(html).toContain("sidebar-accordion-toggle degoog-accordion-toggle");
    expect(html).toContain("sidebar-accordion-body degoog-accordion-body");
    expect(html).not.toContain("<script");
    expect(INLINE_HANDLER_RE.test(html)).toBe(false);
  });

  test("is absent when no engine reported a timing", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    expect(html).not.toContain("engine-stat-row");
  });

  test("the degoog index pseudo engine gets no retry link", async () => {
    harness({
      settings: enabled(),
      results: [makeResult()],
      engineTimings: [{ name: "Degoog", time: 2, resultCount: 1 }],
    });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("from your index");
    expect(html).not.toContain("engine-retry-link");
  });
});

describe("nojs retry links", () => {
  const timings: EngineTiming[] = [
    { name: "Fake", id: "fake-engine", time: 40, resultCount: 3 },
  ];

  test("renders a retry link with the real page classes", async () => {
    harness({ settings: enabled(), results: [makeResult()], engineTimings: timings });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain('class="engine-retry-link degoog-link"');
    expect(html).toContain("retry=fake-engine");
  });

  test("the retry link carries query, type, page and filters", async () => {
    harness({
      settings: enabled(),
      results: [makeResult()],
      totalPages: 5,
      engineTimings: timings,
    });
    const html = await text(
      "/nojs/search?q=hello&type=engine%3Aimages&page=2&time=week&lang=fr&dateFrom=2020-01-01&dateTo=2020-02-01",
    );
    const href = /href="([^"]*retry=fake-engine[^"]*)"/.exec(html)?.[1] ?? "";
    expect(href).toContain("q=hello");
    expect(href).toContain("type=engine%3Aimages");
    expect(href).toContain("page=2");
    expect(href).toContain("time=week");
    expect(href).toContain("lang=fr");
    expect(href).toContain("dateFrom=2020-01-01");
    expect(href).toContain("dateTo=2020-02-01");
  });

  test("following a retry link calls handleRetry instead of handleSearch", async () => {
    harness({ settings: enabled(), results: [makeResult()], engineTimings: timings });
    const html = await text("/nojs/search?q=hello&retry=fake-engine");
    expect(retryParamsSeen).toHaveLength(1);
    expect(retryParamsSeen[0].engineName).toBe("fake-engine");
    expect(retryParamsSeen[0].query).toBe("hello");
    expect(searchParamsSeen).toHaveLength(0);
    expect(html).toContain("First result");
  });

  test("a retried page still ships no javascript", async () => {
    harness({ settings: enabled(), results: [makeResult()], engineTimings: timings });
    const html = await text("/nojs/search?q=hello&retry=fake-engine");
    expect(html).not.toContain("<script");
    expect(INLINE_HANDLER_RE.test(html)).toBe(false);
  });
});

describe("nojs tab routing", () => {
  test("an engine type runs a normal search with the resolved type", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    await text("/nojs/search?q=hello&type=engine%3Aimages");
    expect(searchParamsSeen).toHaveLength(1);
    expect(searchParamsSeen[0].searchType).toBe("images");
    expect(tabSearchSeen).toHaveLength(0);
  });

  test("a tab prefixed engine type still runs a normal search", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    await text("/nojs/search?q=hello&type=tab%3Aengine%3Anews");
    expect(searchParamsSeen).toHaveLength(1);
    expect(searchParamsSeen[0].searchType).toBe("news");
    expect(tabSearchSeen).toHaveLength(0);
  });

  test("a plugin tab id goes to the tab search handler", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    await text("/nojs/search?q=hello&type=tab%3Atorrents");
    expect(tabSearchSeen).toEqual(["torrents"]);
    expect(searchParamsSeen).toHaveLength(0);
  });

  test("the plain web type runs a normal web search", async () => {
    harness({ settings: enabled(), results: [makeResult()] });
    await text("/nojs/search?q=hello&type=web");
    expect(searchParamsSeen).toHaveLength(1);
    expect(searchParamsSeen[0].searchType).toBe("web");
    expect(tabSearchSeen).toHaveLength(0);
  });
});

describe("nojs image results", () => {
  const imageResult = makeResult({
    title: "A cat",
    url: "https://pics.test/cat",
    thumbnail: "https://pics.test/cat-thumb.jpg",
    imageUrl: "https://pics.test/cat-full.jpg",
  });

  test("renders an image grid rather than web cards", async () => {
    harness({ settings: enabled(), results: [imageResult] });
    const html = await text("/nojs/search?q=cats&type=engine%3Aimages");
    expect(html).toContain('class="image-grid"');
    expect(html).toContain('class="image-card"');
    expect(html).toContain("image-thumb-wrap");
    expect(html).toContain('src="https://pics.test/cat-thumb.jpg"');
    expect(html).toContain("pics.test");
    expect(html).not.toContain("result-snippet");
  });

  test("puts the layout into media mode", async () => {
    harness({ settings: enabled(), results: [imageResult] });
    const html = await text("/nojs/search?q=cats&type=engine%3Aimages");
    expect(html).toContain('id="results-layout" class="media-mode"');
  });

  test("falls back to the full image when there is no thumbnail", async () => {
    harness({
      settings: enabled(),
      results: [makeResult({ thumbnail: undefined, imageUrl: "https://pics.test/only.jpg" })],
    });
    const html = await text("/nojs/search?q=cats&type=engine%3Aimages");
    expect(html).toContain('src="https://pics.test/only.jpg"');
  });

  test("the image grid ships no javascript", async () => {
    harness({ settings: enabled(), results: [imageResult] });
    const html = await text("/nojs/search?q=cats&type=engine%3Aimages");
    expect(html).not.toContain("<script");
    expect(INLINE_HANDLER_RE.test(html)).toBe(false);
  });

  test("a web search keeps the web result card", async () => {
    harness({ settings: enabled(), results: [imageResult] });
    const html = await text("/nojs/search?q=cats");
    expect(html).toContain("result-snippet");
    expect(html).not.toContain('class="image-grid"');
  });
});

const NOJS_DIR = "src/public/themes/degoog-theme/nojs";

const NOJS_ONLY_TEMPLATES = ["logo", "pagination", "tabs"];

describe("nojs template names", () => {
  for (const name of NOJS_TEMPLATE_NAMES) {
    test(`the nojs name ${name} resolves to a template`, async () => {
      expect(await loadNojsTemplate(name)).not.toBeNull();
    });
  }

  test("only the templates with no reusable counterpart survive", async () => {
    const files = await readdir(NOJS_DIR);
    expect(files.filter((file) => file.startsWith("nojs-"))).toEqual([]);
    expect(files.filter((file) => file.endsWith(".html")).sort()).toEqual(
      NOJS_ONLY_TEMPLATES.map((name) => `${name}.html`).sort(),
    );
  });

  test("every surviving override is a known template name", () => {
    for (const name of NOJS_ONLY_TEMPLATES) {
      expect([...NOJS_TEMPLATE_NAMES] as string[]).toContain(name);
    }
  });

  test("inherited templates arrive without scripts or inline handlers", async () => {
    for (const name of NOJS_TEMPLATE_NAMES) {
      const html = (await loadNojsTemplate(name)) ?? "";
      expect(html).not.toContain("<script");
      expect(INLINE_HANDLER_RE.test(html)).toBe(false);
    }
  });
});

describe("nojs pagination", () => {
  test("is absent for a single page of results", async () => {
    harness({ settings: enabled(), results: [makeResult()], totalPages: 1 });
    const html = await text("/nojs/search?q=hello");
    expect(html).not.toContain("nojs-pagination");
  });

  test("accepts a POST search when postMethodEnabled is on", async () => {
    harness({
      settings: { ...enabled(), postMethodEnabled: "true" },
      results: [makeResult()],
    });
    const res = await call("/nojs/search", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ q: "hello" }).toString(),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("First result");
    expect(html).toContain('method="post"');
  });

  test("is present for more than one page of results", async () => {
    harness({ settings: enabled(), results: [makeResult()], totalPages: 3 });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("pagination-pages");
    expect(html).toContain('href="/nojs/search?q=hello&amp;page=2"');
    expect(html).toContain('href="/nojs/search?q=hello&amp;page=3"');
  });
});

const SLOTS_MOD = "../../src/server/extensions/slots/registry";
const PLUGIN_SETTINGS_MOD = "../../src/server/utils/plugin-settings";

const slotsReal = { ...(await import(SLOTS_MOD)) };
const pluginSettingsReal = { ...(await import(PLUGIN_SETTINGS_MOD)) };

interface SlotSpy {
  id: string;
  contexts: SlotPluginContext[];
}

const makeSlotPlugin = (
  id: string,
  supportsNojs: boolean | undefined,
  spy: SlotSpy[],
  position: SlotPanelPosition = SlotPanelPosition.KnowledgePanel,
): SlotPlugin => {
  const record: SlotSpy = { id, contexts: [] };
  spy.push(record);
  return {
    id,
    settingsId: id,
    name: id,
    description: id,
    position,
    ...(supportsNojs === undefined ? {} : { supportsNojs }),
    trigger: () => true,
    execute: async (_query, context) => {
      if (context) record.contexts.push(context);
      return { title: `${id} title`, html: `<p class="${id}-body">${id} panel</p>` };
    },
  };
};

const slotHarness = (plugins: SlotPlugin[]): void => {
  mock.module(PLUGIN_SETTINGS_MOD, () => ({
    ...pluginSettingsReal,
    getSettings: async () => ({}),
    isDisabled: async () => false,
  }));
  mock.module(SLOTS_MOD, () => ({
    ...slotsReal,
    getSlotPlugins: () => plugins,
  }));
};

describe("nojs slot panels are opt in", () => {
  afterEach(() => {
    mock.module(SLOTS_MOD, () => slotsReal);
    mock.module(PLUGIN_SETTINGS_MOD, () => pluginSettingsReal);
  });

  test("a slot without supportsNojs is left off the page", async () => {
    const spy: SlotSpy[] = [];
    slotHarness([makeSlotPlugin("silent-slot", undefined, spy)]);
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    expect(html).not.toContain("silent-slot");
    expect(spy[0].contexts).toHaveLength(0);
  });

  test("a slot with supportsNojs false is left off the page", async () => {
    const spy: SlotSpy[] = [];
    slotHarness([makeSlotPlugin("declined-slot", false, spy)]);
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    expect(html).not.toContain("declined-slot");
    expect(spy[0].contexts).toHaveLength(0);
  });

  test("a knowledge panel lands in the sidebar accordion above the engine stats", async () => {
    const spy: SlotSpy[] = [];
    slotHarness([makeSlotPlugin("willing-slot", true, spy)]);
    harness({
      settings: enabled(),
      results: [makeResult()],
      engineTimings: [{ name: "Fake", id: "fake-engine", time: 4, resultCount: 1 }],
    });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain('data-slot="willing-slot"');
    expect(html).toContain("willing-slot title");
    expect(html).toContain("willing-slot panel");
    const sidebar = sliceById(html, "results-sidebar");
    expect(sidebar).toContain("willing-slot panel");
    expect(sidebar).toContain("sidebar-accordion");
    expect(sidebar.indexOf("willing-slot panel")).toBeLessThan(
      sidebar.indexOf("engine-performance-panel"),
    );
    expect(html).not.toContain("nojs-slots");
  });

  test("positional slots land in their own containers", async () => {
    const spy: SlotSpy[] = [];
    slotHarness([
      makeSlotPlugin("above-slot", true, spy, SlotPanelPosition.AboveResults),
      makeSlotPlugin("glance-slot", true, spy, SlotPanelPosition.AtAGlance),
    ]);
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");

    const aboveResults = sliceById(html, "slot-above-results");
    expect(aboveResults).toContain("above-slot panel");
    expect(aboveResults).toContain(
      'class="results-slot-panel degoog-panel degoog-panel--slot degoog-panel--stack-item" data-slot="above-slot" data-grid="4"',
    );
    expect(aboveResults).toContain(
      "results-slot-panel-body degoog-panel--slot-body degoog-panel--slot-body-padded",
    );

    const glanceBox = sliceById(html, "at-a-glance");
    expect(glanceBox).toContain("glance-slot panel");
    expect(glanceBox).not.toContain("results-slot-panel");
  });

  test("only the opted in slot of a mixed set reaches the page", async () => {
    const spy: SlotSpy[] = [];
    slotHarness([
      makeSlotPlugin("keep-me", true, spy),
      makeSlotPlugin("drop-me", undefined, spy),
    ]);
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("keep-me panel");
    expect(html).not.toContain("drop-me");
  });

  test("execute receives nojs true in its context", async () => {
    const spy: SlotSpy[] = [];
    slotHarness([makeSlotPlugin("context-slot", true, spy)]);
    harness({ settings: enabled(), results: [makeResult()] });
    await text("/nojs/search?q=hello");
    expect(spy[0].contexts.length).toBeGreaterThan(0);
    for (const context of spy[0].contexts) {
      expect(context.nojs).toBe(true);
    }
  });

  test("a rendered panel still leaves no script tag and no inline handlers", async () => {
    const spy: SlotSpy[] = [];
    slotHarness([makeSlotPlugin("clean-slot", true, spy)]);
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    expect(html).toContain("clean-slot panel");
    expect(html).not.toContain("<script");
    expect(INLINE_HANDLER_RE.test(html)).toBe(false);
  });

  test("no opted in slot leaves the slots area empty", async () => {
    const spy: SlotSpy[] = [];
    slotHarness([makeSlotPlugin("absent-slot", undefined, spy)]);
    harness({ settings: enabled(), results: [makeResult()] });
    const html = await text("/nojs/search?q=hello");
    expect(html).not.toContain("nojs-slots");
    expect(html).not.toContain("__NOJS_SLOTS__");
  });
});

const COMMANDS_MOD = "../../src/server/extensions/commands/registry";
const commandsReal = { ...(await import(COMMANDS_MOD)) };

interface CommandSpy {
  args: string[];
  contexts: CommandContext[];
}

const makeBangCommand = (
  trigger: string,
  supportsNojs: boolean | undefined,
  spy: CommandSpy,
  totalPages?: number,
): BangCommand => ({
  name: trigger,
  description: trigger,
  trigger,
  ...(supportsNojs === undefined ? {} : { supportsNojs }),
  execute: async (args, context) => {
    spy.args.push(args);
    if (context) spy.contexts.push(context);
    return {
      title: `${trigger} title`,
      html: `<p class="${trigger}-body">${trigger} output</p>`,
      ...(totalPages === undefined ? {} : { totalPages }),
    };
  },
});

interface BangHarness {
  match: BangMatch | null;
  disabled?: boolean;
  results?: ScoredResult[];
}

const searchCalls: SearchParams[] = [];

const bangHarness = ({ match, disabled = false, results = [] }: BangHarness): void => {
  searchCalls.length = 0;
  mock.module(SERVER_SETTINGS_MOD, () => ({
    ...serverSettingsReal,
    getInstanceSettings: async () => enabled(),
  }));
  mock.module(SEARCH_HANDLERS_MOD, () => ({
    ...searchHandlersReal,
    handleSearch: async (params: SearchParams) => {
      searchCalls.push(params);
      return makeResponse(results);
    },
  }));
  mock.module(PLUGIN_SETTINGS_MOD, () => ({
    ...pluginSettingsReal,
    getSettings: async () => ({}),
    isDisabled: async () => disabled,
  }));
  mock.module(COMMANDS_MOD, () => ({
    ...commandsReal,
    matchBangCommand: () => match,
  }));
};

describe("nojs bang commands", () => {
  afterEach(() => {
    mock.module(COMMANDS_MOD, () => commandsReal);
    mock.module(PLUGIN_SETTINGS_MOD, () => pluginSettingsReal);
  });

  test("an engine bang needs no opt in and searches that engine", async () => {
    bangHarness({
      match: { type: "engine", engineId: "fake-engine", query: "kittens" },
      results: [makeResult()],
    });
    const html = await text("/nojs/search?q=!fake%20kittens");
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0].query).toBe("kittens");
    expect(searchCalls[0].engines).toEqual({ "fake-engine": true });
    expect(html).toContain("First result");
  });

  test("an engine bang with no query goes back to the nojs home", async () => {
    bangHarness({ match: { type: "engine", engineId: "fake-engine", query: "  " } });
    const res = await call("/nojs/search?q=!fake");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/nojs");
    expect(searchCalls).toHaveLength(0);
  });

  test("an opted in command renders its title and html", async () => {
    const spy: CommandSpy = { args: [], contexts: [] };
    bangHarness({
      match: {
        type: "command",
        command: makeBangCommand("willing", true, spy),
        commandId: "willing-command",
        args: "some args",
      },
    });
    const html = await text("/nojs/search?q=!willing%20some%20args");
    expect(html).toContain("willing title");
    expect(html).toContain("willing output");
    expect(html).toContain('data-command="willing-command"');
    expect(spy.args).toEqual(["some args"]);
    expect(searchCalls).toHaveLength(0);
  });

  test("an opted in command receives nojs true in its context", async () => {
    const spy: CommandSpy = { args: [], contexts: [] };
    bangHarness({
      match: {
        type: "command",
        command: makeBangCommand("context", true, spy),
        commandId: "context-command",
        args: "",
      },
    });
    await text("/nojs/search?q=!context");
    expect(spy.contexts).toHaveLength(1);
    expect(spy.contexts[0].nojs).toBe(true);
  });

  test("a command without opt in renders the notice and runs no search", async () => {
    const spy: CommandSpy = { args: [], contexts: [] };
    bangHarness({
      match: {
        type: "command",
        command: makeBangCommand("silent", undefined, spy),
        commandId: "silent-command",
        args: "",
      },
    });
    const html = await text("/nojs/search?q=!silent");
    expect(html).toContain("no-JS environment");
    expect(html).not.toContain("silent output");
    expect(spy.args).toHaveLength(0);
    expect(searchCalls).toHaveLength(0);
  });

  test("a command with supportsNojs false renders the notice", async () => {
    const spy: CommandSpy = { args: [], contexts: [] };
    bangHarness({
      match: {
        type: "command",
        command: makeBangCommand("declined", false, spy),
        commandId: "declined-command",
        args: "",
      },
    });
    const html = await text("/nojs/search?q=!declined");
    expect(html).toContain("no-JS environment");
    expect(spy.args).toHaveLength(0);
  });

  test("the speedtest builtin declines and renders the notice", async () => {
    bangHarness({
      match: {
        type: "command",
        command: speedtestCommand,
        commandId: "speedtest-command",
        args: "",
      },
    });
    const html = await text("/nojs/search?q=!speedtest");
    expect(speedtestCommand.supportsNojs).toBeUndefined();
    expect(html).toContain("no-JS environment");
    expect(html).not.toContain("<script");
    expect(INLINE_HANDLER_RE.test(html)).toBe(false);
  });

  test("a disabled command is never executed", async () => {
    const spy: CommandSpy = { args: [], contexts: [] };
    bangHarness({
      disabled: true,
      match: {
        type: "command",
        command: makeBangCommand("off", true, spy),
        commandId: "off-command",
        args: "",
      },
    });
    const html = await text("/nojs/search?q=!off");
    expect(spy.args).toHaveLength(0);
    expect(html).not.toContain("off output");
    expect(searchCalls).toHaveLength(0);
  });

  test("the ip builtin renders without a script tag or inline handler", async () => {
    bangHarness({
      match: {
        type: "command",
        command: ipCommand,
        commandId: "ip-command",
        args: "",
      },
    });
    const html = await text("/nojs/search?q=!ip");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("api.ipify.org");
    expect(INLINE_HANDLER_RE.test(html)).toBe(false);
  });

  test("the help builtin renders without a script tag, tabs or search box", async () => {
    bangHarness({
      match: {
        type: "command",
        command: helpCommand,
        commandId: "help-command",
        args: "",
      },
    });
    const html = await text("/nojs/search?q=!help");
    expect(html).toContain("help-container");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("help-search-input");
    expect(html).not.toContain("help-tab");
    expect(INLINE_HANDLER_RE.test(html)).toBe(false);
  });

  test("a paginating command can reach its next page", async () => {
    const spy: CommandSpy = { args: [], contexts: [] };
    bangHarness({
      match: {
        type: "command",
        command: makeBangCommand("paged", true, spy, 3),
        commandId: "paged-command",
        args: "",
      },
    });
    const html = await text("/nojs/search?q=!paged");
    expect(html).toContain("page=2");
    expect(spy.contexts[0].page).toBe(1);
  });

  test("a paginating command keeps its page number on the way through", async () => {
    const spy: CommandSpy = { args: [], contexts: [] };
    bangHarness({
      match: {
        type: "command",
        command: makeBangCommand("paged", true, spy, 3),
        commandId: "paged-command",
        args: "",
      },
    });
    await text("/nojs/search?q=!paged&page=2");
    expect(spy.contexts[0].page).toBe(2);
  });

  test("a single page command renders no pagination", async () => {
    const spy: CommandSpy = { args: [], contexts: [] };
    bangHarness({
      match: {
        type: "command",
        command: makeBangCommand("lonely", true, spy),
        commandId: "lonely-command",
        args: "",
      },
    });
    const html = await text("/nojs/search?q=!lonely");
    expect(sliceById(html, "pagination").trim()).toBe("");
  });

  test("the uuid builtin renders values without a copy button", async () => {
    bangHarness({
      match: {
        type: "command",
        command: uuidCommand,
        commandId: "uuid-command",
        args: "2",
      },
    });
    const html = await text("/nojs/search?q=!uuid%202");
    expect(html).toContain("uuid-value");
    expect(html).not.toContain("uuid-copy");
    expect(html).not.toContain("<script");
    expect(INLINE_HANDLER_RE.test(html)).toBe(false);
  });
});
