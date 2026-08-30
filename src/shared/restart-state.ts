export interface RestartState {
  pending: boolean;
  reasons: string[];
}

export const isRestartState = (v: unknown): v is RestartState => {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.pending === "boolean" &&
    Array.isArray(s.reasons) &&
    s.reasons.every((r) => typeof r === "string")
  );
};
