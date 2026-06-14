import {
  getActiveWebEngines,
  getEnginesForCustomType,
} from "../extensions/engines/registry";
import type { EngineConfig, SearchEngine } from "../types";
import { asString, getSettings, maskSecrets } from "../utils/plugin-settings";

export interface ActiveEngine {
  id: string;
  instance: SearchEngine;
  score: number;
}

export const selectActiveEngines = async (
  type: string,
  config: EngineConfig,
): Promise<ActiveEngine[]> => {
  if (type === "web") return getActiveWebEngines(config);
  return Promise.all(
    (await getEnginesForCustomType(type, config)).map(async (e) => ({
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

export const engineSettingsFingerprint = async (
  type: string,
  config: EngineConfig,
): Promise<string> => {
  const active = await selectActiveEngines(type, config);
  const rows = await Promise.all(
    active.map(async ({ id, instance }) => {
      const schema = instance.settingsSchema ?? [];
      const stored = maskSecrets(await getSettings(id), schema);
      return [id, _stableSettings(stored)];
    }),
  );
  return JSON.stringify(rows);
};
