import { describe, test, expect } from "bun:test";
import {
  FOURGET_PAGES,
  mapPages,
} from "../../src/server/extensions/compatibility-layer/fourget/pages";
import {
  nptKey,
  type NptScope,
} from "../../src/server/extensions/compatibility-layer/fourget/npt-key";
import {
  FOURGET_OPT_PREFIX,
  isDriven,
  optionFields,
  overridesFrom,
  type FourGetFilters,
} from "../../src/server/extensions/compatibility-layer/fourget/engine-config";
import {
  phpBinary,
  phpStatus,
  resetPhpProbe,
} from "../../src/server/extensions/compatibility-layer/fourget/php-runtime";
import {
  COMPAT_LAYERS,
  COMPAT_SETTING_KEYS,
  compatLayer,
} from "../../src/server/extensions/compatibility-layer/registry";
import { CompatLayerId } from "../../src/shared/compat-layers";

const FILTERS: FourGetFilters = {
  web: {
    country: {
      display: "Country",
      option: { "us-en": "US (English)", "fr-fr": "France" },
    },
    nsfw: { display: "NSFW", option: { yes: "Yes", no: "No" } },
    newer: { display: "Newer than", option: "_DATE" },
    q: { display: "Query", option: "_SEARCH" },
  },
  images: {
    country: {
      display: "Country",
      option: { "us-en": "US (English)" },
    },
    size: { display: "Size", option: { any: "Any", large: "Large" } },
  },
};

describe("4get page mapping", () => {
  test("with no override a tab maps to its natural page", () => {
    const map = mapPages(FOURGET_PAGES, null);
    expect(map.get("images")?.method).toBe("image");
    expect(map.get("videos")?.method).toBe("video");
  });

  test("a renamed type still reaches the page it came from", () => {
    const map = mapPages(FOURGET_PAGES.slice(0, 3), " web , pictures , clips ");
    expect(map.get("pictures")?.method).toBe("image");
    expect(map.get("clips")?.method).toBe("video");
    expect(map.has("images")).toBe(false);
  });

  test("a short override leaves the rest on their natural names", () => {
    const map = mapPages(FOURGET_PAGES.slice(0, 3), "web,pictures");
    expect(map.get("pictures")?.method).toBe("image");
    expect(map.get("videos")?.method).toBe("video");
  });

  test("an empty slot leaves that page alone without shifting the rest", () => {
    const map = mapPages(FOURGET_PAGES.slice(0, 3), "web,,clips");
    expect(map.get("images")?.method).toBe("image");
    expect(map.get("clips")?.method).toBe("video");
    expect(map.has("videos")).toBe(false);
  });

  test("a rename onto a name a later page still wants keeps the rename", () => {
    const map = mapPages(FOURGET_PAGES.slice(0, 2), "images");
    expect(map.get("images")?.method).toBe("web");
    expect(map.size).toBe(1);
  });
});

describe("4get next page tokens", () => {
  const base: NptScope = {
    query: "cats",
    page: 2,
    nsfw: "maybe",
    timeFilter: "any",
    overrides: {},
  };

  test("the same search asks for the same token", () => {
    expect(nptKey(base)).toBe(nptKey({ ...base, overrides: {} }));
    expect(nptKey({ ...base, overrides: { country: "fr", size: "large" } })).toBe(
      nptKey({ ...base, overrides: { size: "large", country: "fr" } }),
    );
  });

  test("safe search, time filter and engine options each split the token", () => {
    const keys = new Set([
      nptKey(base),
      nptKey({ ...base, nsfw: "no" }),
      nptKey({ ...base, timeFilter: "week" }),
      nptKey({ ...base, overrides: { country: "fr" } }),
      nptKey({ ...base, query: "dogs" }),
      nptKey({ ...base, page: 3 }),
    ]);
    expect(keys.size).toBe(6);
  });

  test("a custom range splits by its own dates, a relative one does not drift", () => {
    const custom: NptScope = { ...base, timeFilter: "custom" };
    expect(nptKey({ ...custom, dateFrom: "2026-01-01" })).not.toBe(
      nptKey({ ...custom, dateFrom: "2026-06-01" }),
    );
    expect(nptKey({ ...base, timeFilter: "day", dateFrom: "2026-01-01" })).toBe(
      nptKey({ ...base, timeFilter: "day", dateFrom: "2026-06-01" }),
    );
  });
});

describe("4get getfilters mapping", () => {
  test("select filters become settings, deduped across pages", () => {
    const fields = optionFields(FILTERS);
    const keys = fields.map((field) => field.key);
    expect(keys).toContain(`${FOURGET_OPT_PREFIX}country`);
    expect(keys).toContain(`${FOURGET_OPT_PREFIX}size`);
    expect(keys.filter((key) => key.endsWith("country")).length).toBe(1);
  });

  test("the first option is the default, matching parsegetfilters", () => {
    const country = optionFields(FILTERS).find((field) =>
      field.key.endsWith("country"),
    );
    expect(country?.default).toBe("us-en");
    expect(country?.options).toEqual(["us-en", "fr-fr"]);
    expect(country?.label).toBe("Country");
  });

  test("nsfw never becomes a setting, safeSearch drives it", () => {
    const keys = optionFields(FILTERS).map((field) => field.key);
    expect(keys).not.toContain(`${FOURGET_OPT_PREFIX}nsfw`);
  });

  test("date and search filters are driven, not configured", () => {
    expect(isDriven({ option: "_DATE" })).toBe(true);
    expect(isDriven({ option: "_SEARCH" })).toBe(true);
    expect(isDriven({ option: { a: "A" } })).toBe(false);
    const keys = optionFields(FILTERS).map((field) => field.key);
    expect(keys).not.toContain(`${FOURGET_OPT_PREFIX}newer`);
    expect(keys).not.toContain(`${FOURGET_OPT_PREFIX}q`);
  });

  test("empty filters produce no settings", () => {
    expect(optionFields({})).toEqual([]);
    expect(optionFields({ web: {} })).toEqual([]);
  });

  test("stored settings turn back into a 4get overrides map", () => {
    expect(
      overridesFrom({
        [`${FOURGET_OPT_PREFIX}country`]: "fr-fr",
        [`${FOURGET_OPT_PREFIX}blank`]: "",
        safeSearch: "off",
        searchTypeOverride: "web",
      }),
    ).toEqual({ country: "fr-fr" });
  });
});

describe("php runtime probe", () => {
  test("the binary honours DEGOOG_PHP_BIN", () => {
    const prev = process.env.DEGOOG_PHP_BIN;
    try {
      delete process.env.DEGOOG_PHP_BIN;
      expect(phpBinary()).toBe("php");
      process.env.DEGOOG_PHP_BIN = "/usr/bin/php84";
      expect(phpBinary()).toBe("/usr/bin/php84");
    } finally {
      if (prev === undefined) delete process.env.DEGOOG_PHP_BIN;
      else process.env.DEGOOG_PHP_BIN = prev;
    }
  });

  test("a php that is not there reports unusable with a reason", async () => {
    const prev = process.env.DEGOOG_PHP_BIN;
    process.env.DEGOOG_PHP_BIN = "/nonexistent/php-that-is-not-here";
    resetPhpProbe();
    try {
      const status = await phpStatus();
      expect(status.ok).toBe(false);
      expect(status.reason).toBeTruthy();
      expect(status.missingExts.length).toBeGreaterThan(0);
    } finally {
      if (prev === undefined) delete process.env.DEGOOG_PHP_BIN;
      else process.env.DEGOOG_PHP_BIN = prev;
      resetPhpProbe();
    }
  });
});

describe("compatibility layer registry", () => {
  test("both layers are registered and addressable by id", () => {
    expect(COMPAT_LAYERS.length).toBeGreaterThanOrEqual(2);
    expect(compatLayer(CompatLayerId.Searx)?.label).toBe("SearX");
    expect(compatLayer(CompatLayerId.FourGet)?.label).toBe("4get");
    expect(compatLayer("nope")).toBeUndefined();
  });

  test("the searx setting keys are not renamed by the refactor", () => {
    expect(COMPAT_SETTING_KEYS).toContain("searxCompatEnabled");
    expect(COMPAT_SETTING_KEYS).toContain("fourgetCompatEnabled");
  });
});
