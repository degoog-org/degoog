import { randomUUID } from "node:crypto";
import { resolveTransport } from "../extensions/transports/registry";
import { logger } from "../utils/logger";
import {
  pickProxyUrl,
  type OutgoingProxyOptions,
} from "../utils/net/outgoing";

export interface EngineSession {
  key: string;
  proxyFor: (opts: OutgoingProxyOptions) => Promise<string | null>;
  touch: (transportName: string) => void;
  close: () => Promise<void>;
}

export const openSession = (): EngineSession => {
  const key = randomUUID();
  const transports = new Set<string>();
  let pinned: Promise<string | null> | undefined;

  const proxyFor = (opts: OutgoingProxyOptions): Promise<string | null> => {
    pinned ??= pickProxyUrl(opts).then((url) => url ?? null);
    return pinned;
  };

  const touch = (transportName: string): void => {
    transports.add(transportName);
  };

  const close = async (): Promise<void> => {
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
