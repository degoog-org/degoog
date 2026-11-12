import { EVENT_STREAM_MIME } from "../../../shared/event-stream";
import { logger } from "../logger";

export type SseSend = (event: string, data: unknown) => void;

type SseRun = (send: SseSend, signal: AbortSignal) => Promise<void>;

type SseFailure = (err: unknown, send: SseSend) => void;

export const eventStream = (
  requestSignal: AbortSignal,
  namespace: string,
  run: SseRun,
  onFailure?: SseFailure,
): Response => {
  const encoder = new TextEncoder();
  const gone = new AbortController();
  let cancelled = false;
  const hangUp = (): void => gone.abort();
  if (requestSignal.aborted) hangUp();
  else requestSignal.addEventListener("abort", hangUp, { once: true });

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SseSend = (event, data) => {
        if (gone.signal.aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch (err) {
          logger.debug(namespace, "client disconnected", err);
          hangUp();
        }
      };
      try {
        await run(send, gone.signal);
      } catch (err) {
        if (onFailure) onFailure(err, send);
        else logger.warn(namespace, "event stream failed", err);
      } finally {
        requestSignal.removeEventListener("abort", hangUp);
        if (!cancelled) {
          try {
            controller.close();
          } catch (err) {
            logger.debug(namespace, "event stream already closed", err);
          }
        }
      }
    },
    cancel() {
      cancelled = true;
      hangUp();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": EVENT_STREAM_MIME,
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
