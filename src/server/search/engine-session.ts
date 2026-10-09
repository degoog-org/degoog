import { randomUUID } from "node:crypto";
import { resolveTransport } from "../extensions/transports/registry";
import { logger } from "../utils/logger";
import {
  pickBatter,
  type OutgoingProxyOptions,
  type Batter,
} from "../utils/net/outgoing";
import { CONNECT_TRIGGER, strikeOut } from "../utils/net/proxy-bench";

export const SESSION_CLOSED_MESSAGE = "engine run already ended";

export interface EngineSession {
  key: string;
  batterFor: (opts: OutgoingProxyOptions, host: string) => Promise<Batter | null>;
  touch: (transportName: string) => boolean;
  noteNoShow: () => void;
  whoBatted: () => Promise<string | undefined>;
  close: (outcome?: string) => Promise<void>;
}

export const openSession = (preferredProxyId?: string): EngineSession => {
  const key = randomUUID();
  const transports = new Set<string>();
  let pinned: Promise<Batter | null> | undefined;
  let pinnedHost = "";
  let proxyFailed = false;
  let closed = false;

  const batterFor = (
    opts: OutgoingProxyOptions,
    host: string,
  ): Promise<Batter | null> => {
    if (!pinned) {
      pinnedHost = host;
      pinned = pickBatter(opts, host, preferredProxyId).then((proxy) => proxy ?? null);
    }
    return pinned;
  };

  const touch = (transportName: string): boolean => {
    if (closed) return false;
    transports.add(transportName);
    return true;
  };

  const noteNoShow = (): void => {
    proxyFailed = true;
  };

  const whoBatted = async (): Promise<string | undefined> =>
    (await pinned?.catch(() => null))?.id;

  const _umpire = async (names: string[], outcome?: string): Promise<void> => {
    const trigger = proxyFailed ? CONNECT_TRIGGER : outcome;
    if (!trigger || !pinned) return;
    const proxy = await pinned.catch(() => null);
    if (!proxy) return;
    if (!names.some((name) => resolveTransport(name).usesContextProxy === true)) return;
    await strikeOut(proxy.id, pinnedHost, trigger);
  };

  const close = async (outcome?: string): Promise<void> => {
    closed = true;
    const names = [...transports];
    transports.clear();
    try {
      await _umpire(names, outcome);
    } catch (err) {
      logger.warn("engine", "could not record proxy trouble for this run", err);
    }
    for (const name of names) {
      try {
        await resolveTransport(name).endSession?.(key);
      } catch (err) {
        logger.warn("engine", `transport "${name}" failed to end session`, err);
      }
    }
  };

  return { key, batterFor, touch, noteNoShow, whoBatted, close };
};
