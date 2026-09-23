import {
  applyDomainReplacements,
  applyDomainScores,
  filterBlockedDomains,
} from "../utils/filtering/domain-filter";
import type { ScoredResult } from "../../shared/search-types";

export async function applyDomainRules(
  results: ScoredResult[],
): Promise<ScoredResult[]> {
  const afterBlock = await filterBlockedDomains(results);
  const afterReplace = await applyDomainReplacements(afterBlock);
  return applyDomainScores(afterReplace);
}
