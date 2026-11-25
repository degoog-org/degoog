import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let dir: string;
let previousDataDir: string | undefined;
let previousSettingsFile: string | undefined;

const CORRUPT = '{"settings": {"proxy": "on"';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "degoog-corrupt-"));
  previousDataDir = process.env["DEGOOG_DATA_DIR"];
  previousSettingsFile = process.env["DEGOOG_SERVER_SETTINGS_FILE"];
  process.env["DEGOOG_DATA_DIR"] = dir;
  process.env["DEGOOG_SERVER_SETTINGS_FILE"] = join(dir, "server-settings.json");
});

afterEach(() => {
  if (previousDataDir === undefined) delete process.env["DEGOOG_DATA_DIR"];
  else process.env["DEGOOG_DATA_DIR"] = previousDataDir;
  if (previousSettingsFile === undefined)
    delete process.env["DEGOOG_SERVER_SETTINGS_FILE"];
  else process.env["DEGOOG_SERVER_SETTINGS_FILE"] = previousSettingsFile;
});

const quarantined = async (base: string): Promise<string[]> =>
  (await readdir(dir)).filter((name) => name.startsWith(`${base}.corrupt-`));

describe("a json file that fails to parse is never overwritten", () => {
  test("the unparseable bytes are kept, not replaced by defaults", async () => {
    const { readJsonOrQuarantine } = await import(
      "../../../src/server/utils/storage/read-json"
    );
    const path = join(dir, "thing.json");
    await writeFile(path, CORRUPT, "utf-8");

    expect(await readJsonOrQuarantine("test", path)).toBeNull();

    const kept = await quarantined("thing.json");
    expect(kept).toHaveLength(1);
    expect(await readFile(join(dir, kept[0]), "utf-8")).toBe(CORRUPT);
  });

  test("a missing file is not quarantined, it is just missing", async () => {
    const { readJsonOrQuarantine } = await import(
      "../../../src/server/utils/storage/read-json"
    );
    expect(await readJsonOrQuarantine("test", join(dir, "absent.json"))).toBeNull();
    expect(await quarantined("absent.json")).toEqual([]);
  });

  test("a read failure that is not ENOENT is raised, not treated as absent", async () => {
    const { readJsonOrQuarantine } = await import(
      "../../../src/server/utils/storage/read-json"
    );
    const path = join(dir, "adirectory.json");
    await mkdir(path);
    expect(readJsonOrQuarantine("test", path)).rejects.toThrow();
  });
});

describe("server-settings survives a corrupt file", () => {
  test("the old instanceId and settings are recoverable afterwards", async () => {
    const path = join(dir, "server-settings.json");
    const original = {
      wizard: true,
      instanceId: "the-original-instance-id",
      settings: { outgoingTransport: "curl" },
    };
    await writeFile(path, `${JSON.stringify(original)} trailing junk`, "utf-8");

    const mod = await import("../../../src/server/utils/settings/server-settings");
    mod.clearServerSettingsCache();
    const settings = await mod.readServerSettings();

    expect(settings.instanceId).toBe(original.instanceId);

    const kept = await quarantined("server-settings.json");
    expect(kept).toHaveLength(1);
    const rescued = await readFile(join(dir, kept[0]), "utf-8");
    expect(rescued).toContain("the-original-instance-id");
    expect(rescued).toContain("outgoingTransport");

    mod.clearServerSettingsCache();
    expect(await mod.getInstanceId()).toBe(original.instanceId);
  });

  test("garbage with no recoverable instanceId gets a fresh one", async () => {
    await writeFile(join(dir, "server-settings.json"), CORRUPT, "utf-8");
    const mod = await import("../../../src/server/utils/settings/server-settings");
    mod.clearServerSettingsCache();
    const settings = await mod.readServerSettings();

    expect(settings.instanceId).toMatch(/^[0-9a-f]{32}$/);
    expect(await quarantined("server-settings.json")).toHaveLength(1);
  });

  test.each(["null", "[]", '"a string"', "42"])(
    "valid JSON that is not an object (%s) is moved aside, not overwritten",
    async (body) => {
      await writeFile(join(dir, "server-settings.json"), body, "utf-8");
      const mod = await import("../../../src/server/utils/settings/server-settings");
      mod.clearServerSettingsCache();

      expect(await mod.didServerSettingsLoadFail()).toBe(true);
      const kept = await quarantined("server-settings.json");
      expect(kept).toHaveLength(1);
      expect(await readFile(join(dir, kept[0]), "utf-8")).toBe(body);
    },
  );
});

describe("a corrupt server-settings.json fails closed", () => {
  const guardStatus = async (): Promise<number> => {
    const { Hono } = await import("hono");
    const { guardApiKey } = await import("../../../src/server/utils/security/api-key-guard");
    const app = new Hono();
    app.get("/x", async (c) => (await guardApiKey(c, "apiKeySearchEnabled")) ?? c.text("ok"));
    return (await app.request("http://localhost/x")).status;
  };

  test("search is refused, across restarts, until an admin saves settings", async () => {
    await writeFile(join(dir, "server-settings.json"), CORRUPT, "utf-8");
    const mod = await import("../../../src/server/utils/settings/server-settings");
    const { settingsLock } = await import("../../../src/server/utils/settings/settings-write");
    mod.clearServerSettingsCache();

    expect(await mod.didServerSettingsLoadFail()).toBe(true);
    expect(await guardStatus()).toBe(401);

    mod.clearServerSettingsCache();
    expect(await mod.didServerSettingsLoadFail()).toBe(true);
    expect(await guardStatus()).toBe(401);

    await mod.updateInstanceSettings({ apiSecretKey: "internal-boot-write" });
    mod.clearServerSettingsCache();
    expect(await mod.didServerSettingsLoadFail()).toBe(true);

    await settingsLock(() => mod.updateInstanceSettings({ rateLimitEnabled: true }));
    expect(await mod.didServerSettingsLoadFail()).toBe(false);
    expect(await guardStatus()).toBe(200);

    mod.clearServerSettingsCache();
    expect(await mod.didServerSettingsLoadFail()).toBe(false);
    expect((await mod.getInstanceSettings()).rateLimitEnabled).toBe(true);
  });

  test("a first boot with no file at all is not treated as corrupt", async () => {
    const mod = await import("../../../src/server/utils/settings/server-settings");
    mod.clearServerSettingsCache();
    expect(await mod.didServerSettingsLoadFail()).toBe(false);
    expect(await guardStatus()).toBe(200);
  });
});

describe("the store catalogue survives a corrupt repos.json", () => {
  test("installed extensions are recoverable after a read and write cycle", async () => {
    const path = join(dir, "repos.json");
    const original = {
      repos: [{ url: "https://example.com/repo.git" }],
      installed: [{ installedAs: "my-engine" }],
    };
    await writeFile(path, `${JSON.stringify(original)},,,`, "utf-8");

    const store = await import("../../../src/server/extensions/store/persistence");
    const data = await store.readReposData();
    expect(data.installed).toEqual([]);

    await store.writeReposData(data);

    const kept = await quarantined("repos.json");
    expect(kept).toHaveLength(1);
    const rescued = await readFile(join(dir, kept[0]), "utf-8");
    expect(rescued).toContain("my-engine");
    expect(rescued).toContain("example.com/repo.git");
  });
});
