import type { EngineContext, SearchResult } from "../../../../types";
import {
  DEGOOG_ENGINE_NAME,
  getKnownTypes,
  queryIndex,
} from "../../../../indexer/store";
import { asBoolean } from "../../../../utils/plugin-settings";
import { getInstanceSettings } from "../../../../utils/server-settings";

export const DEGOOG_ENGINE_ID = "degoog-engine";

const isIndexerOn = async (): Promise<boolean> => {
  const settings = await getInstanceSettings();
  return asBoolean(settings.degoogIndexerEnabled);
};

export const type = async (): Promise<string[]> => {
  if (!(await isIndexerOn())) return [];
  const { getInstalledSearchTypes } = await import("../../registry");
  const seen = new Set(await getInstalledSearchTypes(DEGOOG_ENGINE_ID));
  for (const t of getKnownTypes()) seen.add(t);
  return [...seen];
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
