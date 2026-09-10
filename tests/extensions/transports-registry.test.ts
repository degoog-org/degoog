import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const dir = mkdtempSync(join(tmpdir(), "degoog-transports-registry-"));
const transportsDir = join(dir, "transports");
const settingsFile = join(dir, "plugin-settings.json");
const prev = {
  dataDir: process.env.DEGOOG_DATA_DIR,
  transportsDir: process.env.DEGOOG_TRANSPORTS_DIR,
  settingsFile: process.env.DEGOOG_PLUGIN_SETTINGS_FILE,
};

process.env.DEGOOG_DATA_DIR = dir;
process.env.DEGOOG_TRANSPORTS_DIR = transportsDir;
process.env.DEGOOG_PLUGIN_SETTINGS_FILE = settingsFile;

import {
  getTransportDisplayNames,
  getTransportNames,
  initTransports,
} from "../../src/server/extensions/transports/registry";
import { setSettings } from "../../src/server/utils/plugin-settings";

const TRANSPORT_ID = "hidden-transport";
const TRANSPORT_DISPLAY_NAME = "Hidden Transport";

describe("transport registry", () => {
  beforeAll(async () => {
    mkdirSync(join(transportsDir, "hidden"), { recursive: true });
    writeFileSync(settingsFile, "{}");
    writeFileSync(
      join(transportsDir, "hidden", "index.js"),
      `export default class HiddenTransport {
        name = "hidden";
        displayName = ${JSON.stringify(TRANSPORT_DISPLAY_NAME)};
        available() { return true; }
        async fetch() { return new Response("ok"); }
      }`,
    );
    await initTransports(true);
  });

  afterAll(async () => {
    if (prev.dataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
    else process.env.DEGOOG_DATA_DIR = prev.dataDir;
    if (prev.transportsDir === undefined) delete process.env.DEGOOG_TRANSPORTS_DIR;
    else process.env.DEGOOG_TRANSPORTS_DIR = prev.transportsDir;
    if (prev.settingsFile === undefined) delete process.env.DEGOOG_PLUGIN_SETTINGS_FILE;
    else process.env.DEGOOG_PLUGIN_SETTINGS_FILE = prev.settingsFile;
    await initTransports(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("excludes disabled transports from picker options", async () => {
    expect(await getTransportNames()).toContain(TRANSPORT_ID);
    expect(await getTransportDisplayNames()).toContain(TRANSPORT_DISPLAY_NAME);

    await setSettings(TRANSPORT_ID, { disabled: "true" });

    expect(await getTransportNames()).not.toContain(TRANSPORT_ID);
    expect(await getTransportDisplayNames()).not.toContain(
      TRANSPORT_DISPLAY_NAME,
    );
  });
});
