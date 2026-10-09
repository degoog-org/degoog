import { randomUUID } from "node:crypto";
import { resolveTransport } from "../extensions/transports/registry";
import { logger } from "../utils/logger";
import {
  pickProxyUrl,
  type OutgoingProxyOptions,
} from "../utils/net/outgoing";

export const SESSION_CLOSED_MESSAGE = "engine run already ended";

export interface EngineSession {
  key: string;
  proxyFor: (opts: OutgoingProxyOptions) => Promise<string | null>;
  touch: (transportName: string) => boolean;
  close: () => Promise<void>;
}

export const openSession = (): EngineSession => {
  const key = randomUUID();
  const transports = new Set<string>();
  let pinned: Promise<string | null> | undefined;
  let closed = false;

  const proxyFor = (opts: OutgoingProxyOptions): Promise<string | null> => {
    pinned ??= pickProxyUrl(opts).then((url) => url ?? null);
    return pinned;
  };

  const touch = (transportName: string): boolean => {
    if (closed) return false;
    transports.add(transportName);
    return true;
  };

  const close = async (): Promise<void> => {
    closed = true;
    const names = [...transports];
    transports.clear();
    for (const name of names) {
      try {
        await resolveTransport(name).endSession?.(key);
      } catch (err) {
        logger.warn("engine", `transport "${name}" failed to end session`, err);
      }
    }
  };

  return { key, proxyFor, touch, close };
};
