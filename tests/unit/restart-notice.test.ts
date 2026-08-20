import { describe, expect, test, beforeEach } from "bun:test";

const BASE = "http://degoog.test";
const RESTART_STATE_URL = `${BASE}/api/settings/restart-state`;

type FetchCall = { url: string; init?: RequestInit };

let calls: FetchCall[] = [];

const stubWindow = (): void => {
  (globalThis as Record<string, unknown>).window = {
    scopedT: () => (key: string) => key,
    __DEGOOG_BASE_URL__: BASE,
  };
};

const stubFetch = (respond: () => Promise<Response>): void => {
  (globalThis as Record<string, unknown>).fetch = (
    url: string,
    init?: RequestInit,
  ) => {
    calls.push({ url, init });
    return respond();
  };
};

const jsonOnce = (body: unknown, status = 200): (() => Promise<Response>) =>
  async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

const loadNotice = async () => {
  stubWindow();
  return import("../../src/client/settings/store/restart-notice");
};

const loadFresh = async (tag: string) => {
  stubWindow();
  return import(`../../src/client/settings/store/restart-notice?${tag}`);
};

describe("restart notice state check", () => {
  beforeEach(() => {
    calls = [];
  });

  test("hits the restart-state endpoint with the settings token", async () => {
    const { pendingReasons } = await loadNotice();
    stubFetch(jsonOnce({ pending: true, reasons: ['plugin "alpha" was added'] }));

    const reasons = await pendingReasons(() => "tok");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(RESTART_STATE_URL);
    expect(
      (calls[0].init?.headers as Record<string, string>)["x-settings-token"],
    ).toBe("tok");
    expect(reasons).toEqual(['plugin "alpha" was added']);
  });

  test("returns nothing for the same reasons twice", async () => {
    const { pendingReasons } = await loadNotice();
    const body = { pending: true, reasons: ['theme "beta" was removed'] };
    stubFetch(jsonOnce(body));

    expect(await pendingReasons(() => null)).toEqual(body.reasons);
    expect(await pendingReasons(() => null)).toBeNull();
  });

  test("keeps split reasons distinct from one reason holding a separator", async () => {
    const { pendingReasons } = await loadNotice();
    stubFetch(jsonOnce({ pending: true, reasons: ['plugin "a|b" was added'] }));
    expect(await pendingReasons(() => null)).toEqual(['plugin "a|b" was added']);

    stubFetch(jsonOnce({ pending: true, reasons: ['plugin "a', 'b" was added'] }));
    expect(await pendingReasons(() => null)).toEqual([
      'plugin "a',
      'b" was added',
    ]);
  });

  test("still notifies when a pending restart carries no reasons", async () => {
    const { pendingReasons } = await loadFresh("empty-reasons");
    stubFetch(jsonOnce({ pending: true, reasons: [] }));

    expect(await pendingReasons(() => null)).toEqual([]);
    expect(await pendingReasons(() => null)).toBeNull();
  });

  test("returns nothing when the restart is not pending", async () => {
    const { pendingReasons } = await loadNotice();
    stubFetch(jsonOnce({ pending: false, reasons: ['engine "gamma" was added'] }));

    expect(await pendingReasons(() => null)).toBeNull();
  });

  test("returns nothing when the payload shape is invalid", async () => {
    const { pendingReasons } = await loadNotice();
    stubFetch(jsonOnce({ pending: "yes", reasons: [42] }));

    expect(await pendingReasons(() => null)).toBeNull();
  });

  test("returns nothing when the request fails", async () => {
    const { pendingReasons } = await loadNotice();
    stubFetch(jsonOnce({ pending: true, reasons: ["nope"] }, 500));

    expect(await pendingReasons(() => null)).toBeNull();
  });

  test("returns nothing when the request throws", async () => {
    const { pendingReasons } = await loadNotice();
    stubFetch(() => Promise.reject(new Error("offline")));

    expect(await pendingReasons(() => null)).toBeNull();
  });

  test("runs a single check when tab changes arrive concurrently", async () => {
    const { maybeShowRestartNotice } = await loadNotice();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubFetch(async () => {
      await gate;
      return new Response(JSON.stringify({ pending: false, reasons: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const first = maybeShowRestartNotice(() => null);
    const second = maybeShowRestartNotice(() => null);
    release();
    await Promise.all([first, second]);

    expect(calls).toHaveLength(1);
  });

  test("allows a fresh check once the previous one settled", async () => {
    const { maybeShowRestartNotice } = await loadNotice();
    stubFetch(jsonOnce({ pending: false, reasons: [] }));

    await maybeShowRestartNotice(() => null);
    await maybeShowRestartNotice(() => null);

    expect(calls).toHaveLength(2);
  });
});
