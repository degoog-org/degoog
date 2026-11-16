import type { SearchEventSource } from "./fetch-event-stream";

interface ActiveStream {
  source: SearchEventSource;
  onDrop?: () => void;
}

let _active: ActiveStream | null = null;

export const isActiveStream = (source: SearchEventSource): boolean =>
  _active?.source === source;

export function releaseStream(source: SearchEventSource): void {
  source.close();
  if (_active?.source !== source) return;
  const { onDrop } = _active;
  _active = null;
  onDrop?.();
}

export function abortActiveStream(): void {
  if (_active) releaseStream(_active.source);
}

export function claimStream(source: SearchEventSource, onDrop?: () => void): void {
  abortActiveStream();
  _active = { source, onDrop };
}
