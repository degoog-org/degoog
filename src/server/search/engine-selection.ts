import {
  getActiveWebEngines,
  getEngineInput,
  getEngineMap,
  getEngineSettingsView,
  getEnginesForCustomType,
  readEngineScore,
} from "../extensions/engines/catalog";
import { engineFullSchema } from "../extensions/engines/engine-settings";
import type { SearchEngine } from "../types/extension";
import type { EngineConfig, ImageFilter, SearchImage } from "../types/search";
import { maskSecrets } from "../utils/settings/plugin-settings";
import { ENGINE_INPUT, type EngineInput } from "../../shared/engine-input";

export interface ActiveEngine {
  id: string;
  instance: SearchEngine;
  score: number;
  input: EngineInput;
}

export interface SearchInputs {
  image?: SearchImage;
  imageQuery?: string;
}

export const acceptsInputs = (input: EngineInput, inputs: SearchInputs = {}): boolean =>
  input === ENGINE_INPUT.IMAGE ? !!inputs.image : !inputs.image || !!inputs.imageQuery;

export const engineQuery = (
  input: EngineInput,
  query: string,
  inputs: SearchInputs = {},
): string =>
  input === ENGINE_INPUT.TEXT && inputs.image ? (inputs.imageQuery ?? "") : query;

const _withInput = <T extends { id: string }>(engine: T): T & { input: EngineInput } => ({
  ...engine,
  input: getEngineInput(engine.id),
});

export const selectActiveEngines = async (
  type: string,
  config: EngineConfig,
  imageFilter?: ImageFilter,
  inputs?: SearchInputs,
): Promise<ActiveEngine[]> => {
  const candidates =
    type === "web"
      ? await getActiveWebEngines(config)
      : await Promise.all(
          (await getEnginesForCustomType(type, config, imageFilter)).map(async (e) => ({
            id: e.id,
            instance: e.instance,
            score: await readEngineScore(e.id),
          })),
        );
  return candidates.map(_withInput).filter((e) => acceptsInputs(e.input, inputs));
};

const _stableSettings = (settings: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b)));

export const engineFingerprint = async (id: string): Promise<string> => {
  const instance = getEngineMap()[id];
  const schema = instance ? engineFullSchema(instance) : [];
  const stored = maskSecrets(await getEngineSettingsView(id), schema);
  return JSON.stringify(_stableSettings(stored));
};
