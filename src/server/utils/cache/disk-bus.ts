import { createHash, randomUUID } from "crypto";
import { readFileSync, readdirSync, watch, type FSWatcher } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { writeJsonAtomic } from "../storage/atomic-json";
import { logger } from "../logger";
import { busDir } from "../paths";

const NS = "disk-bus";
const EVENT_EXT = ".json";
const WAKE_FILE = "wake.ping";

interface BusEvent {
  id: string;
  at: number;
  seq: number;
  payload: unknown;
}

interface PendingEvent {
  name: string;
  event: BusEvent;
}

type BusListener = (payload: unknown) => void;

let _watcher: FSWatcher | null = null;
let _dir: string | null = null;
let _seq = 0;
const _lastSeen = new Map<string, string>();

const eventFile = (scope: string, key?: string): string => {
  const hash = createHash("sha1").update(`${scope}\n${key ?? ""}`).digest("hex");
  return `${hash}${EVENT_EXT}`;
};

const isBusEvent = (value: unknown): value is BusEvent => {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Partial<BusEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.at === "number" &&
    typeof event.seq === "number" &&
    "payload" in event
  );
};

const readEvent = (path: string): BusEvent | null => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return isBusEvent(parsed) ? parsed : null;
  } catch (err) {
    logger.debug(NS, `skipping unreadable bus file ${path}`, err);
    return null;
  }
};

const listEvents = (dir: string): string[] => {
  try {
    return readdirSync(dir).filter((name) => name.endsWith(EVENT_EXT));
  } catch (err) {
    logger.error(NS, `cannot list bus folder ${dir}`, err);
    return [];
  }
};

const freshEvents = (dir: string): PendingEvent[] => {
  const pending: PendingEvent[] = [];
  for (const name of listEvents(dir)) {
    const event = readEvent(join(dir, name));
    if (event && _lastSeen.get(name) !== event.id) pending.push({ name, event });
  }
  return pending.sort((a, b) => a.event.at - b.event.at || a.event.seq - b.event.seq);
};

const drainBus = (dir: string, listener: BusListener): void => {
  for (const { name, event } of freshEvents(dir)) {
    _lastSeen.set(name, event.id);
    listener(event.payload);
  }
};

export const startDiskBus = async (listener: BusListener): Promise<boolean> => {
  if (_watcher) return true;

  const dir = busDir();
  try {
    await mkdir(dir, { recursive: true });
    const preexisting = freshEvents(dir);
    _watcher = watch(dir, () => drainBus(dir, listener));
    _watcher.on("error", (err) =>
      logger.error(NS, "bus watcher failed, cross-process sync stopped", err),
    );
    for (const { name, event } of preexisting) _lastSeen.set(name, event.id);
    _dir = dir;
    drainBus(dir, listener);
    logger.info(NS, `cross-process sync watching ${dir}`);
    return true;
  } catch (err) {
    logger.error(NS, `cannot watch ${dir}, cross-process sync disabled`, err);
    return false;
  }
};

export const writeBusEvent = async (
  scope: string,
  key: string | undefined,
  payload: unknown,
): Promise<void> => {
  const dir = _dir;
  if (!dir) return;

  const event: BusEvent = { id: randomUUID(), at: Date.now(), seq: ++_seq, payload };
  try {
    await writeJsonAtomic(join(dir, eventFile(scope, key)), event);
    await writeFile(join(dir, WAKE_FILE), String(event.seq));
  } catch (err) {
    logger.error(NS, `failed to publish ${scope} to ${dir}`, err);
  }
};

export const stopDiskBus = (): void => {
  try {
    _watcher?.close();
  } catch (err) {
    logger.error(NS, "failed to close bus watcher", err);
  }
  _watcher = null;
  _dir = null;
  _lastSeen.clear();
};
