import { randomBytes } from "crypto";
import { logger } from "./logger";

export const VALKEY_URL_ENV = "DEGOOG_VALKEY_URL";

export const INVALIDATE_SCOPE = {
  PLUGIN_SETTINGS: "plugin-settings",
  SERVER_SETTINGS: "server-settings",
  CACHE_CLEAR: "cache-clear",
} as const;

export type InvalidateScope =
  (typeof INVALIDATE_SCOPE)[keyof typeof INVALIDATE_SCOPE];

export interface InvalidatePayload {
  scope: InvalidateScope;
  key?: string;
  origin: string;
}

type ValkeyClient = {
  publish: (channel: string, message: string) => Promise<number>;
  subscribe: (channel: string) => Promise<unknown>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  quit: () => Promise<unknown>;
  duplicate: () => ValkeyClient;
  status: string;
  get: (key: string) => Promise<string | null>;
  set: (...args: unknown[]) => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
  scan: (...args: unknown[]) => Promise<[string, string[]]>;
};

const NS = "cache-valkey";
const PROCESS_ORIGIN = randomBytes(8).toString("hex");
const _handlers = new Set<(payload: InvalidatePayload) => void>();

let _initPromise: Promise<void> | null = null;
let _publisher: ValkeyClient | null = null;
let _subscriber: ValkeyClient | null = null;
let _channel: string | null = null;
let _instanceId: string | null = null;
let _enabled = false;

const _kvKey = (namespace: string, key: string): string =>
  `degoog:${_instanceId}:${namespace}:${key}`;

export const isValkeyEnabled = (): boolean => _enabled;

const _loadClient = async (url: string): Promise<ValkeyClient | null> => {
  try {
    const mod = await import(/* @vite-ignore */ "ioredis" as string);
    const Ctor =
      (mod as { default?: unknown; Redis?: unknown }).default ??
      (mod as { Redis?: unknown }).Redis ??
      mod;
    return new (Ctor as new (u: string) => ValkeyClient)(url);
  } catch (err) {
    logger.error(NS, "failed to load ioredis client", err);
    return null;
  }
};

export const initValkey = async (instanceId: string): Promise<void> => {
  if (_initPromise) return _initPromise;
  const url = process.env[VALKEY_URL_ENV];
  if (!url) {
    _initPromise = Promise.resolve();
    return _initPromise;
  }

  _initPromise = (async () => {
    const client = await _loadClient(url);
    if (!client) return;

    _instanceId = instanceId;
    _channel = `degoog:${instanceId}:invalidate`;
    _publisher = client;
    _subscriber = client.duplicate();

    _publisher.on("error", (err) =>
      logger.error(NS, "valkey publisher error", err),
    );
    _subscriber.on("error", (err) =>
      logger.error(NS, "valkey subscriber error", err),
    );

    _subscriber.on("message", (...args: unknown[]) => {
      const [channel, message] = args as [string, string];
      if (channel !== _channel) return;
      try {
        const payload = JSON.parse(message) as InvalidatePayload;
        if (payload.origin === PROCESS_ORIGIN) return;
        for (const h of _handlers) h(payload);
      } catch (err) {
        logger.error(NS, "invalid invalidate payload", err);
      }
    });

    try {
      await _subscriber.subscribe(_channel);
      _enabled = true;
      logger.info(NS, `valkey connected, channel=${_channel}`);
    } catch (err) {
      logger.error(NS, "valkey subscribe failed; falling back to disk", err);
      _publisher = null;
      _subscriber = null;
      _channel = null;
    }
  })();

  return _initPromise;
};

const _notifyLocal = (payload: InvalidatePayload): void => {
  for (const handler of _handlers) {
    try {
      handler(payload);
    } catch (err) {
      logger.error(NS, `local invalidate handler failed scope=${payload.scope}`, err);
    }
  }
};

export const publishInvalidate = async (
  scope: InvalidateScope,
  key?: string,
): Promise<void> => {
  const payload: InvalidatePayload = { scope, key, origin: PROCESS_ORIGIN };
  const wire = JSON.stringify(payload);
  _notifyLocal(payload);
  if (!_enabled || !_publisher || !_channel) return;
  try {
    await _publisher.publish(_channel, wire);
  } catch (err) {
    logger.error(NS, "publishInvalidate failed", err);
  }
};

export const onInvalidate = (
  handler: (payload: InvalidatePayload) => void,
): (() => void) => {
  _handlers.add(handler);
  return () => _handlers.delete(handler);
};

export const kvGet = async <T>(
  namespace: string,
  key: string,
): Promise<T | null> => {
  if (!_enabled || !_publisher || !_instanceId) return null;
  try {
    const raw = await _publisher.get(_kvKey(namespace, key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.error(NS, `kvGet failed ns=${namespace}`, err);
    return null;
  }
};

export const kvSet = async <T>(
  namespace: string,
  key: string,
  value: T,
  ttlMs: number,
): Promise<void> => {
  if (!_enabled || !_publisher || !_instanceId) return;
  try {
    const ttlSec = Math.max(1, Math.floor(ttlMs / 1000));
    await _publisher.set(_kvKey(namespace, key), JSON.stringify(value), "EX", ttlSec);
  } catch (err) {
    logger.error(NS, `kvSet failed ns=${namespace}`, err);
  }
};

export const kvDel = async (namespace: string, key: string): Promise<void> => {
  if (!_enabled || !_publisher || !_instanceId) return;
  try {
    await _publisher.del(_kvKey(namespace, key));
  } catch (err) {
    logger.error(NS, `kvDel failed ns=${namespace}`, err);
  }
};

const SCAN_BATCH = 200;

export const kvDelPrefix = async (namespace: string): Promise<void> => {
  if (!_enabled || !_publisher || !_instanceId) return;
  try {
    const pattern = _kvKey(namespace, "*");
    let cursor = "0";
    do {
      const [next, keys] = await _publisher.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        SCAN_BATCH,
      );
      if (keys.length > 0) await _publisher.del(...keys);
      cursor = next;
    } while (cursor !== "0");
  } catch (err) {
    logger.error(NS, `kvDelPrefix failed ns=${namespace}`, err);
  }
};

export const closeValkey = async (): Promise<void> => {
  try {
    await _publisher?.quit();
    await _subscriber?.quit();
  } catch (err) {
    logger.error(NS, "closeValkey error", err);
  }
  _publisher = null;
  _subscriber = null;
  _enabled = false;
};
