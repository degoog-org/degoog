import { idbGet } from "./db";
import { SETTINGS_KEY } from "../constants";
import { getBase } from "./base-url";
import type { EngineRecord, EngineRegistry } from "../types";

let cachedRegistry: EngineRegistry | null = null;
let inflightRegistry: Promise<EngineRegistry> | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("extensions-saved", () => {
    cachedRegistry = null;
    inflightRegistry = null;
  });
}

export const getRegistry = async (): Promise<EngineRegistry> => {
  if (cachedRegistry) return cachedRegistry;
  if (!inflightRegistry) {
    inflightRegistry = fetch(`${getBase()}/api/engines`)
      .then((res) => res.json() as Promise<EngineRegistry>)
      .then((data) => {
        cachedRegistry = data;
        inflightRegistry = null;
        return data;
      });
  }
  return inflightRegistry;
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
  const engines = await getEngines();
  const reg = await getRegistry();
  const types = new Set<string>();
  for (const { id, searchType } of reg.engines) {
    if (engines[id] && searchType) types.add(searchType);
  }
  return types;
};
