import {
  getActiveWebEngines,
  getEngineMap,
  getEnginesForCustomType,
} from "../extensions/engines/registry";
import type { EngineConfig, ImageFilter, SearchEngine } from "../types";
import { asString, getSettings, maskSecrets } from "../utils/plugin-settings";

export interface ActiveEngine {
  id: string;
  instance: SearchEngine;
  score: number;
}

export const selectActiveEngines = async (
  type: string,
  config: EngineConfig,
  imageFilter?: ImageFilter,
): Promise<ActiveEngine[]> => {
  if (type === "web") return getActiveWebEngines(config);
  return Promise.all(
    (await getEnginesForCustomType(type, config, imageFilter)).map(async (e) => ({
      id: e.id,
      instance: e.instance,
      score: await readEngineScore(e.id),
    })),
  );
};

export const readEngineScore = async (id: string): Promise<number> => {
  const stored = await getSettings(id);
  const parsed = parseFloat(asString(stored["score"]));
  const score = Number.isFinite(parsed) ? parsed : 1;
  return Math.max(score, 0.1);
};

const _stableSettings = (settings: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b)));

export const engineFingerprint = async (id: string): Promise<string> => {
  const schema = getEngineMap()[id]?.settingsSchema ?? [];
  const stored = maskSecrets(await getSettings(id), schema);
  return JSON.stringify(_stableSettings(stored));
};
