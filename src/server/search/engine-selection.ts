import { getActiveWebEngines, getEngineMap, getEngineSettingsView, getEnginesForCustomType } from "../extensions/engines/catalog";
import { engineFullSchema } from "../extensions/engines/engine-settings";
import type { SearchEngine } from "../types/extension";
import type { EngineConfig, ImageFilter } from "../types/search";
import { asString, getSettings, maskSecrets } from "../utils/settings/plugin-settings";

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

const readEngineScore = async (id: string): Promise<number> => {
  const stored = await getSettings(id);
  const parsed = parseFloat(asString(stored["score"]));
  const score = Number.isFinite(parsed) ? parsed : 1;
  return Math.max(score, 0.1);
};

const _stableSettings = (settings: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b)));

export const engineFingerprint = async (id: string): Promise<string> => {
  const instance = getEngineMap()[id];
  const schema = instance ? engineFullSchema(instance) : [];
  const stored = maskSecrets(await getEngineSettingsView(id), schema);
  return JSON.stringify(_stableSettings(stored));
};
