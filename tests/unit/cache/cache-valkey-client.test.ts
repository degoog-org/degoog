import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

type Listener = (...args: unknown[]) => void;

interface FakeClient {
  listeners: Map<string, Listener[]>;
  disconnected: boolean;
  status: string;
  on: (event: string, cb: Listener) => void;
  emit: (event: string, ...args: unknown[]) => void;
  subscribe: () => Promise<unknown>;
  publish: () => Promise<number>;
  quit: () => Promise<unknown>;
  disconnect: () => void;
  duplicate: () => FakeClient;
}

let failSubscribe = false;
const made: FakeClient[] = [];

const makeClient = (): FakeClient => {
  const client: FakeClient = {
    listeners: new Map(),
    disconnected: false,
    status: "ready",
    on: (event, cb) => {
      client.listeners.set(event, [...(client.listeners.get(event) ?? []), cb]);
    },
    emit: (event, ...args) => {
      for (const cb of client.listeners.get(event) ?? []) cb(...args);
    },
    subscribe: async () => {
      if (failSubscribe) throw new Error("NOAUTH");
      return 1;
    },
    publish: async () => 1,
    quit: async () => "OK",
    disconnect: () => {
      client.disconnected = true;
    },
    duplicate: () => makeClient(),
  };
  made.push(client);
  return client;
};

class FakeRedis {
  constructor() {
    return makeClient();
  }
}

let valkey: typeof import("../../../src/server/utils/cache/cache-valkey");
let root: string;
const prevUrl = process.env.DEGOOG_VALKEY_URL;
const prevDataDir = process.env.DEGOOG_DATA_DIR;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "degoog-valkey-client-"));
  process.env.DEGOOG_DATA_DIR = root;
  process.env.DEGOOG_VALKEY_URL = "redis://fake:6379";
  mock.module("ioredis", () => ({ default: FakeRedis }));
  valkey = await import("../../../src/server/utils/cache/cache-valkey");
  await valkey.closeValkey();
});

afterEach(async () => {
  await valkey.closeValkey();
  made.length = 0;
  failSubscribe = false;
});

afterAll(async () => {
  if (prevUrl === undefined) delete process.env.DEGOOG_VALKEY_URL;
  else process.env.DEGOOG_VALKEY_URL = prevUrl;
  if (prevDataDir === undefined) delete process.env.DEGOOG_DATA_DIR;
  else process.env.DEGOOG_DATA_DIR = prevDataDir;
  await rm(root, { recursive: true, force: true });
});

describe("utils/cache-valkey client", () => {
  test("a failed subscribe disconnects both clients", async () => {
    failSubscribe = true;
    await valkey.initValkey("instance-a");

    expect(made).toHaveLength(2);
    expect(made.every((c) => c.disconnected)).toBe(true);
    expect(valkey.isValkeyEnabled()).toBe(false);
    expect(valkey.getValkeyStatus()).toBe(valkey.VALKEY_STATUS.UNREACHABLE);
  });

  test("status follows the live connection", async () => {
    await valkey.initValkey("instance-c");
    expect(valkey.getValkeyStatus()).toBe(valkey.VALKEY_STATUS.CONNECTED);

    made[0].status = "reconnecting";
    expect(valkey.getValkeyStatus()).toBe(valkey.VALKEY_STATUS.UNREACHABLE);

    made[0].status = "ready";
    expect(valkey.getValkeyStatus()).toBe(valkey.VALKEY_STATUS.CONNECTED);
  });

  test("status is off when no valkey url is set", () => {
    delete process.env.DEGOOG_VALKEY_URL;
    try {
      expect(valkey.getValkeyStatus()).toBe(valkey.VALKEY_STATUS.OFF);
    } finally {
      process.env.DEGOOG_VALKEY_URL = "redis://fake:6379";
    }
  });

  test("messages are validated before reaching handlers", async () => {
    await valkey.initValkey("instance-b");
    const seen: unknown[] = [];
    const off = valkey.onInvalidate((payload) => seen.push(payload));
    const subscriber = made[1];
    const channel = "degoog:instance-b:invalidate";
    const valid = { scope: valkey.INVALIDATE_SCOPE.CACHE_CLEAR, origin: "peer" };

    subscriber.emit("message", channel, JSON.stringify({ scope: "nope", origin: "peer" }));
    subscriber.emit("message", channel, "not json");
    subscriber.emit("message", "other-channel", JSON.stringify(valid));
    subscriber.emit("message", channel, JSON.stringify(valid));
    off();

    expect(seen).toEqual([valid]);
  });
});
