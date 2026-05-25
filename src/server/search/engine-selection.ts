import {
  getActiveWebEngines,
  getEnginesForCustomType,
  getEnginesForSearchType,
} from "../extensions/engines/registry";
import type { EngineConfig, SearchEngine, SearchType } from "../types";

export interface ActiveEngine {
  id: string;
  instance: SearchEngine;
  score: number;
}

const BUILTIN_TYPES = new Set(["web", "images", "videos", "news"]);

/**
 * Single source of truth for which engines run a given search.
 *
 * `includeCustom` mirrors the streaming endpoint, which also resolves
 * plugin-defined custom result tabs via `getEnginesForCustomType`. The
 * non-streaming path passes `false` to preserve its existing behavior.
 */
export const selectActiveEngines = async (
  type: SearchType,
  config: EngineConfig,
  includeCustom = false,
): Promise<ActiveEngine[]> => {
  if (type === "web") return getActiveWebEngines(config);

  if (!includeCustom || BUILTIN_TYPES.has(type)) {
    return (await getEnginesForSearchType(type, config)).map((e) => ({
      id: e.id,
      instance: e.instance,
      score: 1,
    }));
  }

  return (await getEnginesForCustomType(type)).map((e) => ({
    id: e.id,
    instance: e.instance,
    score: 1,
  }));
};
