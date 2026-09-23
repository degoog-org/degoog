import type { ScoredResult } from "../../../shared/search-types";

export function mergeStreamingMediaResults(
  _current: ScoredResult[],
  latestScored: ScoredResult[],
): ScoredResult[] {
  return latestScored;
}
