import { afterAll, beforeAll, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";

const FETCH_MOD = "../../src/server/extensions/logos/fetch";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COMMIT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

let manifestCalls = 0;
let imageCalls: string[] = [];
let manifest: () => Promise<unknown> = async () => ({});

mock.module(FETCH_MOD, () => ({
  fetchLogoManifest: async () => {
    manifestCalls += 1;
    return manifest();
  },
  fetchLogoImage: async (commit: string, path: string) => {
    imageCalls.push(`${commit}/${path}`);
    return { bytes: PNG, contentType: "image/png" };
  },
}));

const settings = await import("../../src/server/utils/settings/server-settings");
const { initServerKey } = await import("../../src/server/utils/security/server-key");
const cache = await import("../../src/server/utils/cache/cache");
const daily = await import("../../src/server/extensions/logos/daily");
const { parseManifestDay } = await import("../../src/server/extensions/logos/manifest");
const logosRouter = (await import("../../src/server/routes/logos")).default;

const today = daily.logoDateKey();

const entry = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  query: "Comic Book Day",
  title: { "en-US": "Happy Comic Book Day!", "sv-SE": "Glad seriedag!" },
  authors: [{ name: "pmc" }, { name: "Panonim", url: "https://github.com/Panonim" }],
  image: `logos/${today}/${id}/image.png`,
  ...extra,
});

const manifestFor = (date: string, ...logos: Record<string, unknown>[]): unknown => ({
  version: 1,
  commit: COMMIT,
  logos: logos.length ? { [date]: logos } : {},
});

const manifestWith = (...logos: Record<string, unknown>[]): unknown => manifestFor(today, ...logos);

const settle = async (): Promise<void> => {
  while (daily.isLogoDayLoading()) await Bun.sleep(1);
};

const loadToday = async (): Promise<Awaited<ReturnType<typeof daily.todaysLogo>>> => {
  await daily.todaysLogo();
  await settle();
  return daily.todaysLogo();
};

beforeAll(async () => {
  await initServerKey();
  settings.clearServerSettingsCache();
  await settings.setInstanceSettings({});
});

afterAll(async () => {
  await settings.setInstanceSettings({});
  settings.clearServerSettingsCache();
});

beforeEach(async () => {
  await cache.clearByScope(cache.CACHE_SCOPE.ALL);
  await settings.setInstanceSettings({});
  manifestCalls = 0;
  imageCalls = [];
  manifest = async () => manifestWith(entry("comic-book-day"));
});

describe("daily logo fetching", () => {
  test("asks dedoodles once a day however many pages load", async () => {
    manifest = async () => {
      await Bun.sleep(20);
      return manifestWith(entry("comic-book-day"));
    };
    expect(await Promise.all([daily.todaysLogo(), daily.todaysLogo(), daily.todaysLogo()])).toEqual([
      null,
      null,
      null,
    ]);
    await settle();
    for (let i = 0; i < 5; i++) {
      expect((await daily.todaysLogo())?.logo.id).toBe("comic-book-day");
    }
    expect(manifestCalls).toBe(1);
    expect(imageCalls).toEqual([`${COMMIT}/logos/${today}/comic-book-day/image.png`]);
  });

  test("a day without a logo never downloads an image", async () => {
    manifest = async () => manifestWith();
    expect(await loadToday()).toBeNull();
    await daily.todaysLogo();
    expect(manifestCalls).toBe(1);
    expect(imageCalls).toEqual([]);
  });

  test("a failed check waits instead of retrying on every page, a manual refresh retries now", async () => {
    manifest = async () => {
      throw new Error("offline");
    };
    expect(await loadToday()).toBeNull();
    expect((await daily.readLogoDay())?.status).toBe(daily.LOGO_DAY_STATUS.FAILED);
    await daily.todaysLogo();
    expect(manifestCalls).toBe(1);

    manifest = async () => manifestWith(entry("comic-book-day"));
    expect((await daily.refreshTodaysLogo()).status).toBe(daily.LOGO_DAY_STATUS.OK);
    expect(manifestCalls).toBe(2);
    expect((await daily.todaysLogo())?.logo.id).toBe("comic-book-day");
  });

  test("a failed manual check keeps the logo that was already showing", async () => {
    await loadToday();
    manifest = async () => {
      throw new Error("offline");
    };
    expect((await daily.refreshTodaysLogo()).status).toBe(daily.LOGO_DAY_STATUS.FAILED);
    expect((await daily.todaysLogo())?.logo.id).toBe("comic-book-day");
  });

  test("turned off, it never contacts dedoodles", async () => {
    await settings.setInstanceSettings({ logosEnabled: "false" });
    expect(await loadToday()).toBeNull();
    expect(manifestCalls).toBe(0);
  });

  test("turning it off drops the logo it already had", async () => {
    await loadToday();
    await settings.setInstanceSettings({ logosEnabled: "false" });
    expect(await daily.todaysLogo()).toBeNull();
    await settings.setInstanceSettings({});
    expect(await daily.readLogoDay()).toBeNull();
  });

  test("a check still running when it gets turned off keeps nothing", async () => {
    manifest = async () => {
      await settings.setInstanceSettings({ logosEnabled: "false" });
      return manifestWith(entry("comic-book-day"));
    };
    await daily.todaysLogo();
    await settle();
    await settings.setInstanceSettings({});
    expect(await daily.readLogoDay()).toBeNull();
  });

  test("with several logos for the day, everyone gets the same one until tomorrow", async () => {
    manifest = async () => manifestWith(entry("first"), entry("second"), entry("third"));
    const picked = (await loadToday())?.logo.id;
    expect(["first", "second", "third"]).toContain(picked!);
    for (let i = 0; i < 10; i++) {
      expect((await daily.todaysLogo())?.logo.id).toBe(picked!);
    }
    expect(imageCalls).toHaveLength(1);
  });
});

describe("GET /api/logos/image", () => {
  const get = (path: string, headers: Record<string, string> = {}): Promise<Response> =>
    Promise.resolve(logosRouter.request(new Request(`http://localhost${path}`, { headers })));

  test("serves today's image with a sniffed type, then answers 304 to the same ETag", async () => {
    await loadToday();
    const res = await get(`/api/logos/image/${today}/comic-book-day`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toStartWith("private, max-age=");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);

    const etag = res.headers.get("ETag")!;
    const again = await get(`/api/logos/image/${today}/comic-book-day`, { "If-None-Match": etag });
    expect(again.status).toBe(304);
  });

  test("a page rendered just before midnight still gets its image after midnight", async () => {
    try {
      setSystemTime(new Date(2027, 8, 25, 23, 59, 50));
      manifest = async () =>
        manifestFor("20270925", entry("comic-book-day", { image: "logos/20270925/comic-book-day/image.png" }));
      expect((await loadToday())?.date).toBe("20270925");
      setSystemTime(new Date(2027, 8, 26, 0, 0, 30));
      expect((await get("/api/logos/image/20270925/comic-book-day")).status).toBe(200);
    } finally {
      setSystemTime();
    }
  });

  test("anything but today's logo is a 404", async () => {
    await loadToday();
    expect((await get(`/api/logos/image/${today}/someone-else`)).status).toBe(404);
    expect((await get("/api/logos/image/20000101/comic-book-day")).status).toBe(404);
  });

  test("is a 404 once the admin turns logos off", async () => {
    await loadToday();
    await settings.setInstanceSettings({ logosEnabled: "false" });
    expect((await get(`/api/logos/image/${today}/comic-book-day`)).status).toBe(404);
  });
});

describe("manifest parsing", () => {
  test("only accepts images inside the logo's own folder", () => {
    const day = parseManifestDay(
      manifestWith(
        entry("escape", { image: "logos/../../package.json" }),
        entry("borrowed", { image: `logos/${today}/comic-book-day/image.png` }),
        entry("svg", { image: `logos/${today}/svg/image.svg` }),
        entry("fine"),
      ),
      today,
    );
    expect(day?.logos.map((logo) => logo.id)).toEqual(["fine"]);
  });

  test("drops author links that are not https and refuses a commit it cannot put in a URL", () => {
    const day = parseManifestDay(
      manifestWith(entry("fine", { authors: [{ name: "pmc", url: "javascript:alert(1)" }] })),
      today,
    );
    expect(day?.logos[0].authors).toEqual([{ name: "pmc" }]);
    expect(parseManifestDay({ commit: "../main", logos: {} }, today)).toBeNull();
  });
});

describe("pages", () => {
  test("the home page carries today's logo in the visitor's language", async () => {
    await loadToday();
    const pages = (await import("../../src/server/routes/pages/pages")).default;
    const res = await pages.request(
      new Request("http://localhost/", { headers: { "Accept-Language": "sv-SE" } }),
    );
    const html = await res.text();
    expect(html).toContain("window.__DEGOOG_LOGO__=");
    expect(html).toContain('"title":"Glad seriedag!"');
    expect(html).toContain(`/api/logos/image/${today}/comic-book-day?v=`);
  });

  test("the no-JS home page searches the logo's query with the instance's form method", async () => {
    await loadToday();
    await settings.setInstanceSettings({ nojsEnabled: "true", postMethodEnabled: "true" });
    const nojs = (await import("../../src/server/nojs/router")).default;
    const html = await (await nojs.request("http://localhost/nojs")).text();
    expect(html).toMatch(/<form class="daily-logo" action="\/nojs\/search" method="post">/);
    expect(html).toContain('<input type="hidden" name="q" value="Comic Book Day"');
    expect(html).toContain("Today's dedoodle by:");
    expect(html).toContain('<a href="https://github.com/Panonim" target="_blank" rel="noopener noreferrer">Panonim</a>');
  });
});
