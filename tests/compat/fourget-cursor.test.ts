import { afterAll, afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { RpcHandlers } from "../../src/server/extensions/compatibility-layer/rpc";
import type { EngineContext } from "../../src/server/types/search";

const RPC_MOD = "../../src/server/extensions/compatibility-layer/rpc";
const PHP_MOD = "../../src/server/extensions/compatibility-layer/fourget/php-runtime";
const SERVER_SETTINGS_MOD = "../../src/server/utils/settings/server-settings";

const rpcReal = { ...(await import(RPC_MOD)) };
const phpReal = { ...(await import(PHP_MOD)) };
const serverSettingsReal = { ...(await import(SERVER_SETTINGS_MOD)) };
const { TTL_MS } = await import("../../src/server/utils/cache/cache");

const MINUTE = 60 * 1000;
const savedFourgetDir = process.env.DEGOOG_FOURGET_DIR;
let root = "";
let searches: { npt: string | false }[] = [];
let nextId = 0;

const fakeFourGet = async (
  _spec: unknown,
  _runner: string,
  payload: Record<string, unknown>,
  handlers?: RpcHandlers,
) => {
  if (payload.action === "discover") {
    return { engines: [{ code: "brave", types: ["web"], filters: {} }] };
  }
  const npt = payload.npt as string | false;
  searches.push({ npt });
  let page = 1;
  if (npt) {
    const held = await handlers!.onCache!({ op: "get", key: `w.${npt}` });
    if (held === null) throw new Error("The next page token is invalid or has expired!");
    page = Number(held);
  }
  const id = `brave${++nextId}`;
  await handlers!.onCache!({ op: "set", key: `w.${id}`, value: String(page + 1), ttl: 900 });
  return {
    results: [{ title: `page ${page}`, url: `https://brave.test/${page}`, snippet: "" }],
    npt: id,
    related: [],
  };
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "degoog-fourget-cursor-"));
  mkdirSync(join(root, "scraper"), { recursive: true });
  mkdirSync(join(root, "lib"), { recursive: true });
  writeFileSync(join(root, "scraper", "brave.php"), "<?php\n");
  process.env.DEGOOG_FOURGET_DIR = root;
  mock.module(RPC_MOD, () => ({ ...rpcReal, runBridge: fakeFourGet }));
  mock.module(PHP_MOD, () => ({ ...phpReal, phpStatus: async () => ({ ok: true }) }));
  mock.module(SERVER_SETTINGS_MOD, () => ({
    ...serverSettingsReal,
    getInstanceSettings: async () => ({ fourgetCompatEnabled: "true" }),
  }));
});

afterAll(() => {
  mock.module(RPC_MOD, () => rpcReal);
  mock.module(PHP_MOD, () => phpReal);
  mock.module(SERVER_SETTINGS_MOD, () => serverSettingsReal);
  rmSync(root, { recursive: true, force: true });
  if (savedFourgetDir === undefined) delete process.env.DEGOOG_FOURGET_DIR;
  else process.env.DEGOOG_FOURGET_DIR = savedFourgetDir;
});

let clock: ReturnType<typeof spyOn> | undefined;
afterEach(() => {
  clock?.mockRestore();
  clock = undefined;
  searches = [];
});

const loadBrave = async () => {
  const { loadFourGetEngines } = await import(
    "../../src/server/extensions/compatibility-layer/fourget/index"
  );
  const [entry] = await loadFourGetEngines();
  return entry.instance;
};

const context = (): EngineContext =>
  ({ searchType: "web", pagination: () => {} }) as unknown as EngineContext;

const advance = (ms: number): void => {
  const at = Date.now() + ms;
  clock?.mockRestore();
  clock = spyOn(Date, "now").mockReturnValue(at);
};

describe("4get next page cursors live as long as the cached page they came from", () => {
  test("page 2 still works an hour after page 1, with no extra upstream request", async () => {
    const brave = await loadBrave();
    const query = `cursor-hour-${Date.now()}`;
    await brave.executeSearch(query, 1, "any", context());

    advance(60 * MINUTE);
    const page2 = await brave.executeSearch(query, 2, "any", context());

    expect(page2.map((r) => r.title)).toEqual(["page 2"]);
    expect(searches.map((s) => Boolean(s.npt))).toEqual([false, true]);
  });

  test("once the page cache would have expired the cursor is gone too, and nothing is fetched", async () => {
    const brave = await loadBrave();
    const query = `cursor-expired-${Date.now()}`;
    await brave.executeSearch(query, 1, "any", context());

    advance(TTL_MS + MINUTE);
    const page2 = await brave.executeSearch(query, 2, "any", context());

    expect(page2).toEqual([]);
    expect(searches).toHaveLength(1);
  });
});
