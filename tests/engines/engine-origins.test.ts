import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const hostsFile = join(tmpdir(), `degoog-origin-hosts-${Date.now()}.json`);
const _originalHostsFile = process.env.DEGOOG_ENGINE_HOSTS_FILE;
process.env.DEGOOG_ENGINE_HOSTS_FILE = hostsFile;

import { engineOrigin } from "../../src/server/extensions/engines/origins";
import { primeEngineHosts } from "../../src/server/extensions/engines/engine-hosts";
import {
  DEFAULT_ENGINE_ORIGIN_DISPLAY,
  EngineOriginDisplay,
  EngineOriginKind,
  isOriginDisplay,
  type EngineOrigin,
} from "../../src/shared/engine-origins";
import { ENGINE_ORIGIN_DISPLAY, isValidSyncValue } from "../../src/shared/sync";
import { SETTINGS_SCHEMA, coerceSetting } from "../../src/server/utils/settings/settings-schema";

const STORE_ORIGIN: EngineOrigin = {
  kind: EngineOriginKind.Store,
  label: "official-extensions",
  glyph: "fa-store",
};

const origins = new Map<string, EngineOrigin>([
  ["startpage", STORE_ORIGIN],
  ["brave", STORE_ORIGIN],
]);

beforeAll(async () => {
  await writeFile(
    hostsFile,
    JSON.stringify({ "brave-engine": "search.brave.com" }),
    "utf-8",
  );
  await primeEngineHosts();
});

afterAll(async () => {
  if (_originalHostsFile === undefined) delete process.env.DEGOOG_ENGINE_HOSTS_FILE;
  else process.env.DEGOOG_ENGINE_HOSTS_FILE = _originalHostsFile;
  await unlink(hostsFile).catch(() => {});
});

describe("engine origins", () => {
  test("a store engine with a site gets a proxied favicon on top of its provenance", () => {
    const origin = engineOrigin(
      { id: "startpage-engine", site: "https://www.startpage.com" },
      origins,
    );
    expect(origin.kind).toBe(EngineOriginKind.Store);
    expect(origin.glyph).toBe("fa-store");
    expect(origin.favicon).toBe("/api/proxy/favicon?domain=www.startpage.com");
  });

  test("a store engine with no declared site uses the host it actually fetched", () => {
    const origin = engineOrigin({ id: "brave-engine" }, origins);
    expect(origin.favicon).toBe("/api/proxy/favicon?domain=search.brave.com");
  });

  test("an engine that has never run keeps provenance only", () => {
    const origin = engineOrigin({ id: "startpage-engine" }, origins);
    expect(origin.favicon).toBeUndefined();
  });

  test("a declared site wins over the observed host", () => {
    const origin = engineOrigin(
      { id: "brave-engine", site: "https://example.org" },
      origins,
    );
    expect(origin.favicon).toBe("/api/proxy/favicon?domain=example.org");
  });

  test("a junk site never becomes a favicon url", () => {
    const origin = engineOrigin({ id: "startpage-engine", site: "not a url" }, origins);
    expect(origin.favicon).toBeUndefined();
  });

  test("compat engines keep their layer icon and still carry a favicon", () => {
    const origin = engineOrigin(
      {
        id: "startpage-4get-engine",
        compatibilityLayer: "4get",
        site: "https://www.startpage.com",
      },
      origins,
    );
    expect(origin.kind).toBe(EngineOriginKind.Compat);
    expect(origin.icon).toContain("4get.png");
    expect(origin.favicon).toBe("/api/proxy/favicon?domain=www.startpage.com");
  });
});

describe("engine origin display setting", () => {
  test("defaults to favicons", () => {
    expect(SETTINGS_SCHEMA.engineOriginDisplay.default).toBe(
      DEFAULT_ENGINE_ORIGIN_DISPLAY,
    );
    expect(DEFAULT_ENGINE_ORIGIN_DISPLAY).toBe(EngineOriginDisplay.Favicon);
  });

  test("an unknown value falls back to the default", () => {
    const def = SETTINGS_SCHEMA.engineOriginDisplay;
    expect(coerceSetting(def, "provenance")).toBe(EngineOriginDisplay.Provenance);
    expect(coerceSetting(def, "off")).toBe(EngineOriginDisplay.Off);
    expect(coerceSetting(def, "sparkles")).toBe(DEFAULT_ENGINE_ORIGIN_DISPLAY);
  });

  test("the synced client key only accepts the three modes", () => {
    expect(isOriginDisplay("favicon")).toBe(true);
    expect(isValidSyncValue(ENGINE_ORIGIN_DISPLAY, "off")).toBe(true);
    expect(isValidSyncValue(ENGINE_ORIGIN_DISPLAY, true)).toBe(false);
    expect(isValidSyncValue(ENGINE_ORIGIN_DISPLAY, "sparkles")).toBe(false);
  });
});
