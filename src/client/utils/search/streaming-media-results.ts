import type { ScoredResult } from "../../../server/types";

export function mergeStreamingMediaResults(
  _current: ScoredResult[],
  latestScored: ScoredResult[],
): ScoredResult[] {
  return latestScored;
}
