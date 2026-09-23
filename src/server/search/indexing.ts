import { type FilterContext, maybeIndex, toFilterTag } from "../indexer/store/record";
import type { ScoredResult } from "../../shared/search-types";

export const recordIndexBasis = async (
  enabled: boolean,
  query: string,
  type: string,
  basis: ScoredResult[],
  scope: FilterContext,
): Promise<string[]> =>
  maybeIndex(enabled, query, type, basis, toFilterTag(scope));
