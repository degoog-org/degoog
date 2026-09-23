import type { TransportWsHandlers } from "../../types/extension";
import { getTransportWsSession } from "./ws-session";

const _handlers = new Map<string, TransportWsHandlers>();

export const mountTransportWs = (name: string, h: TransportWsHandlers): void => {
  const session = getTransportWsSession(name);
  _handlers.set(name, {
    onUpgrade: h.onUpgrade?.bind(h),
    onOpen: (ws) => {
      session.setBrowser(ws);
      h.onOpen(ws);
    },
    onMessage: (ws, raw) => {
      session.dispatch(raw);
      h.onMessage(ws, raw);
    },
    onClose: (ws) => {
      if (session.browser === ws) session.setBrowser(null);
      h.onClose(ws);
    },
  });
};

export const getTransportWsHandlers = (): ReadonlyMap<string, TransportWsHandlers> =>
  _handlers;
