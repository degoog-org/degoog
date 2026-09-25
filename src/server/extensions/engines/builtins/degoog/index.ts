import type { EngineContext } from "../../../../types/search";
import {
  DEGOOG_ENGINE_NAME,
  type SearchResult,
} from "../../../../../shared/search-types";
import { getKnownTypes } from "../../../../indexer/store/admin";
import { queryIndex } from "../../../../indexer/store/query";
import { isIndexerOn } from "../../../../indexer/config/load";

export const DEGOOG_ENGINE_ID = "degoog-engine";

export const type = async (): Promise<string[]> => {
  if (!(await isIndexerOn())) return [];
  const { getInstalledSearchTypes } = await import("../../catalog");
  const installed = await getInstalledSearchTypes(DEGOOG_ENGINE_ID);
  const installedByLower = new Map(installed.map((t) => [t.toLowerCase(), t]));
  const matched = new Set<string>();
  for (const known of getKnownTypes()) {
    const match = installedByLower.get(known.toLowerCase());
    if (match) matched.add(match);
  }
  return [...matched];
};

class DegoogEngine {
  name = DEGOOG_ENGINE_NAME;
  bangShortcut = "degoog";

  async executeSearch(
    query: string,
    page?: number,
    _timeFilter?: string,
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    if (!(await isIndexerOn())) return [];
    const engineType = context?.searchType;
    if (!engineType) return [];
    return queryIndex(query, engineType, undefined, page);
  }
}

export default DegoogEngine;
