export interface SearchEventSource {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

const EVENT_SEPARATOR = /\r?\n\r?\n/;

const _parseBlock = (block: string): { event: string; data: string } | null => {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  return data.length ? { event, data: data.join("\n") } : null;
};

export class PostEventStream implements SearchEventSource {
  private readonly _target = new EventTarget();
  private readonly _abort = new AbortController();

  constructor(url: string, body: unknown, headers: Record<string, string> = {}) {
    void this._read(url, body, headers);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this._target.addEventListener(type, listener as EventListener);
  }

  close(): void {
    this._abort.abort();
  }

  private _emit(event: string, data: string): void {
    this._target.dispatchEvent(new MessageEvent(event, { data }));
  }

  private async _read(
    url: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<void> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: this._abort.signal,
      });
      if (!res.ok || !res.body) {
        this._emit("error", JSON.stringify({ status: res.status }));
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const blocks = buffer.split(EVENT_SEPARATOR);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const parsed = _parseBlock(block);
          if (parsed) this._emit(parsed.event, parsed.data);
        }
      }
      if (!this._abort.signal.aborted) this._emit("error", "{}");
    } catch (err) {
      if (this._abort.signal.aborted) return;
      console.warn("[streaming-search] image stream failed", err);
      this._emit("error", "{}");
    }
  }
}
