import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SlotPlugin } from "../../src/server/types/extension";
import { SlotPanelPosition } from "../../src/shared/search-types";

const SLOT_TIMEOUT_MS = 300;
const savedTimeout = process.env.DEGOOG_SLOT_TIMEOUT_MS;
process.env.DEGOOG_SLOT_TIMEOUT_MS = String(SLOT_TIMEOUT_MS);

const SETTINGS_MOD = "../../src/server/utils/settings/plugin-settings";
const SLOTS_MOD = "../../src/server/extensions/slots/registry";
const EVENT_STREAM = "text/event-stream";

const settingsReal = { ...(await import(SETTINGS_MOD)) };
const slotsReal = { ...(await import(SLOTS_MOD)) };

type StreamEvent = { event: string; data: Record<string, unknown>; at: number };

let slots: SlotPlugin[] = [];
let router: { request: (req: Request) => Response | Promise<Response> };

const NEVER = new Promise<never>(() => {});

const _gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
};

const _slot = (
  id: string,
  position: SlotPanelPosition,
  overrides: Partial<SlotPlugin> = {},
): SlotPlugin => ({
  id,
  settingsId: id,
  name: id,
  description: id,
  position,
  trigger: () => true,
  execute: async () => ({ html: id }),
  ...overrides,
});

const _post = (path: string, accept?: string): Promise<Response> =>
  Promise.resolve(
    router.request(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accept ? { Accept: accept } : {}),
        },
        body: JSON.stringify({ query: "hello" }),
      }),
    ),
  );

const _readEvents = async (res: Response): Promise<StreamEvent[]> => {
  const started = performance.now();
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const events: StreamEvent[] = [];
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return events;
    buffer += value;
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const [eventLine, dataLine] = block.split("\n");
      events.push({
        event: eventLine.slice("event: ".length),
        data: JSON.parse(dataLine.slice("data: ".length)),
        at: performance.now() - started,
      });
    }
  }
};

const _stream = async (path: string): Promise<StreamEvent[]> => {
  const res = await _post(path, EVENT_STREAM);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe(EVENT_STREAM);
  return _readEvents(res);
};

beforeAll(async () => {
  mock.module(SETTINGS_MOD, () => ({
    ...settingsReal,
    getSettings: async () => ({}),
    isDisabled: async () => false,
  }));
  mock.module(SLOTS_MOD, () => ({
    ...slotsReal,
    getSlotPlugins: () => slots,
  }));
  router = (await import("../../src/server/routes/search/slots")).default;
});

afterAll(() => {
  mock.module(SETTINGS_MOD, () => settingsReal);
  mock.module(SLOTS_MOD, () => slotsReal);
  if (savedTimeout === undefined) delete process.env.DEGOOG_SLOT_TIMEOUT_MS;
  else process.env.DEGOOG_SLOT_TIMEOUT_MS = savedTimeout;
});

describe("POST /api/slots streamed", () => {
  test("a trigger that never settles does not hold back the other panels, and the stream still closes", async () => {
    slots = [
      _slot("hangs", SlotPanelPosition.KnowledgePanel, { trigger: () => NEVER }),
      _slot("fast", SlotPanelPosition.AboveResults),
    ];
    const events = await _stream("/api/slots");
    expect(events.map((e) => e.event)).toEqual(["panel", "done"]);
    const [panel, done] = events;
    expect(panel.data).toMatchObject({ id: "fast", order: 1 });
    expect(panel.at).toBeLessThan(SLOT_TIMEOUT_MS / 2);
    expect(done.at).toBeGreaterThanOrEqual(SLOT_TIMEOUT_MS - 20);
    expect(done.data).toEqual({ pending: false });
  });

  test("panels arrive as they settle and carry their registry order", async () => {
    const lastSettled = _gate();
    slots = [
      _slot("first", SlotPanelPosition.KnowledgePanel, {
        execute: async () => {
          await lastSettled.opened;
          return { html: "first" };
        },
      }),
      _slot("quiet", SlotPanelPosition.AboveResults, { trigger: () => false }),
      _slot("third", SlotPanelPosition.BelowResults, {
        execute: async () => {
          setTimeout(lastSettled.open, 20);
          return { html: "third" };
        },
      }),
    ];
    const events = await _stream("/api/slots");
    expect(
      events.map((e) => [e.event, e.data.id ?? null, e.data.order ?? null]),
    ).toEqual([
      ["panel", "third", 2],
      ["panel", "first", 0],
      ["done", null, null],
    ]);
  });

  test("a plain JSON caller still gets one body in registry order with no order field", async () => {
    slots = [
      _slot("first", SlotPanelPosition.KnowledgePanel, { gridSize: 2 }),
      _slot("quiet", SlotPanelPosition.AboveResults, { trigger: () => false }),
      _slot("third", SlotPanelPosition.BelowResults),
    ];
    const res = await _post("/api/slots");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      panels: [
        { id: "first", html: "first", position: SlotPanelPosition.KnowledgePanel, gridSize: 2 },
        { id: "third", html: "third", position: SlotPanelPosition.BelowResults },
      ],
    });
  });
});

describe("POST /api/slots/glance streamed", () => {
  test("a hanging execute is cut by the timeout while the rest stream through", async () => {
    slots = [
      _slot("hangs", SlotPanelPosition.AtAGlance, { execute: () => NEVER }),
      _slot("waits", SlotPanelPosition.AtAGlance, { waitForResults: true }),
      _slot("fast", SlotPanelPosition.AtAGlance),
    ];
    const events = await _stream("/api/slots/glance");
    expect(events.map((e) => e.event).sort()).toEqual(["done", "panel", "pending"]);
    const panel = events.find((e) => e.event === "panel")!;
    const pending = events.find((e) => e.event === "pending")!;
    const done = events.at(-1)!;
    expect(panel.data).toMatchObject({ id: "fast", order: 2 });
    expect(panel.at).toBeLessThan(SLOT_TIMEOUT_MS / 2);
    expect(pending.at).toBeLessThan(SLOT_TIMEOUT_MS / 2);
    expect(done.event).toBe("done");
    expect(done.data).toEqual({ pending: true });
    expect(done.at).toBeGreaterThanOrEqual(SLOT_TIMEOUT_MS - 20);
  });

  test("the JSON glance body keeps its panels and pending shape", async () => {
    slots = [
      _slot("waits", SlotPanelPosition.AtAGlance, { waitForResults: true }),
      _slot("fast", SlotPanelPosition.AtAGlance),
    ];
    const res = await _post("/api/slots/glance");
    expect(await res.json()).toEqual({
      panels: [{ id: "fast", html: "fast", position: SlotPanelPosition.AtAGlance }],
      pending: true,
    });
  });

  test("a plugin that declares a longer budget than the default keeps it", async () => {
    slots = [
      _slot("patient", SlotPanelPosition.AtAGlance, {
        timeoutMs: SLOT_TIMEOUT_MS * 4,
        execute: async () => {
          await Bun.sleep(SLOT_TIMEOUT_MS * 2);
          return { html: "patient" };
        },
      }),
    ];
    const events = await _stream("/api/slots/glance");
    expect(events.map((e) => [e.event, e.data.id ?? null])).toEqual([
      ["panel", "patient"],
      ["done", null],
    ]);
  });
});
