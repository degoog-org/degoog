export type StoreStreamPhase = "start" | "ok" | "failed";

export interface StoreStreamEvent {
  repoUrl?: string;
  itemPath?: string;
  type?: string;
  url?: string;
  name?: string;
  i: number;
  total: number;
  phase: StoreStreamPhase;
  error?: string;
}

const isPhase = (v: unknown): v is StoreStreamPhase =>
  v === "start" || v === "ok" || v === "failed";

export const isStoreEvent = (v: unknown): v is StoreStreamEvent => {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    isPhase(e.phase) &&
    typeof e.total === "number" &&
    Number.isInteger(e.total) &&
    e.total > 0 &&
    typeof e.i === "number" &&
    Number.isInteger(e.i) &&
    e.i >= 0 &&
    e.i <= e.total
  );
};
