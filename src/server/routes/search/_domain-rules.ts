import {
  applyDomainReplacements,
  applyDomainScores,
  filterBlockedDomains,
} from "../../utils/domain-filter";
import { filterDeadLinks } from "../../utils/dead-links";
import type { ScoredResult } from "../../types";

export async function applyDomainRules(
  results: ScoredResult[],
  opts?: { checkDeadLinks?: boolean },
): Promise<ScoredResult[]> {
  const afterBlock = await filterBlockedDomains(results);
  const afterReplace = await applyDomainReplacements(afterBlock);
  const scored = await applyDomainScores(afterReplace);
  if (opts?.checkDeadLinks === false) return scored;
  return filterDeadLinks(scored);
}
