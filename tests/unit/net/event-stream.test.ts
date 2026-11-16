import { describe, expect, test } from "bun:test";
import { eventStream } from "../../../src/server/utils/net/event-stream";

describe("eventStream", () => {
  test("cancelling the body drops the request abort listener while the run is still pending", async () => {
    const request = new AbortController();
    const removed: string[] = [];
    const remove = request.signal.removeEventListener.bind(request.signal);
    request.signal.removeEventListener = ((type: string, listener: EventListener) => {
      removed.push(type);
      remove(type, listener);
    }) as AbortSignal["removeEventListener"];
    let runSignal: AbortSignal | undefined;
    const res = eventStream(request.signal, "test", (_send, signal) => {
      runSignal = signal;
      return new Promise<void>(() => {});
    });
    await Promise.resolve();
    await res.body!.cancel();
    expect(removed).toEqual(["abort"]);
    expect(runSignal?.aborted).toBe(true);
  });
});
