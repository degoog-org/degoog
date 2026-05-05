import { idbGet } from "./db";
import { SETTINGS_KEY } from "../constants";
import { getBase } from "./base-url";
import type { EngineRecord, EngineRegistry } from "../types";

let cachedRegistry: EngineRegistry | null = null;

export const getRegistry = async (): Promise<EngineRegistry> => {
  if (cachedRegistry) return cachedRegistry;
  const res = await fetch(`${getBase()}/api/engines`);
  const data = (await res.json()) as EngineRegistry;
  cachedRegistry = data;
  return cachedRegistry;
};

export const getEngines = async (): Promise<EngineRecord> => {
  const saved = (await idbGet<EngineRecord>(SETTINGS_KEY)) ?? {};
  const reg = await getRegistry();
  const merged: EngineRecord = {};
  for (const { id } of reg.engines) {
    merged[id] = saved[id] ?? reg.defaults?.[id] ?? true;
  }
  return merged;
};

export const getEnabledSearchTypes = async (): Promise<Set<string>> => {
  const [engines, reg] = await Promise.all([getEngines(), getRegistry()]);
  const types = new Set<string>();
  for (const { id, searchType } of reg.engines) {
    if (engines[id] && searchType) types.add(searchType);
  }
  return types;
};
