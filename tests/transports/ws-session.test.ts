import { describe, expect, test } from "bun:test";
import { TransportWsSession } from "../../src/server/extensions/transports/ws-session";
import type { TransportWsSocket } from "../../src/server/types/extension";

const connected = (): { session: TransportWsSession; sent: string[] } => {
  const sent: string[] = [];
  const session = new TransportWsSession();
  session.setBrowser({ send: (m: string) => sent.push(m) } as unknown as TransportWsSocket);
  return { session, sent };
};

describe("transport ws session", () => {
  test("commands are numbered and resolve with the matching reply", async () => {
    const { session, sent } = connected();
    const reply = session.cmd("open", { url: "u" });
    expect(JSON.parse(sent[0])).toEqual({ action: "open", seqid: 1, url: "u" });
    session.dispatch(JSON.stringify({ seqid: 1, ok: true }));
    expect(await reply).toEqual({ seqid: 1, ok: true });
  });

  test("a command without a browser is refused", async () => {
    await expect(new TransportWsSession().cmd("open")).rejects.toThrow(
      "4play: no browser extension connected",
    );
  });

  test("dom_ready resolves the waiting tab with its data", async () => {
    const { session } = connected();
    const ready = session.awaitDom(7, 1000);
    session.dispatch(JSON.stringify({ action: "dom_ready", data: { id: 8 } }));
    session.dispatch(JSON.stringify({ action: "dom_ready", data: { id: 7, html: "x" } }));
    expect(await ready).toEqual({ id: 7, html: "x" });
  });

  test("dom_load_fail rejects the waiting tab", async () => {
    const { session } = connected();
    const ready = session.awaitDom(3, 1000);
    session.dispatch(JSON.stringify({ action: "dom_load_fail", data: { id: 3 } }));
    await expect(ready).rejects.toThrow("4play: page load failed");
  });

  test("a settled tab ignores later events and other actions are ignored", async () => {
    const { session } = connected();
    const ready = session.awaitDom(5, 1000);
    session.dispatch(JSON.stringify({ action: "something_else", data: { id: 5 } }));
    session.dispatch(JSON.stringify({ action: "dom_ready", data: { id: "5" } }));
    session.dispatch(JSON.stringify({ action: "dom_ready", data: { id: 5, n: 1 } }));
    session.dispatch(JSON.stringify({ action: "dom_load_fail", data: { id: 5 } }));
    expect(await ready).toEqual({ id: 5, n: 1 });
  });

  test("an unanswered dom wait times out", async () => {
    const { session } = connected();
    await expect(session.awaitDom(9, 5)).rejects.toThrow("4play: dom_ready timed out");
  });
});
