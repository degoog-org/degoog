import type { TransportWsHandlers } from "../../types";

const _handlers = new Map<string, TransportWsHandlers>();

export const mountTransportWs = (name: string, h: TransportWsHandlers): void => {
  _handlers.set(name, h);
};

export const getTransportWsHandlers = (): ReadonlyMap<string, TransportWsHandlers> =>
  _handlers;
