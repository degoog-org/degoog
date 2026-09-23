import { typeLabel } from "./type-label";
import type { ExtensionMeta } from "../../types/extension";

export const engineTypes = (engine: ExtensionMeta): string[] => {
  if (engine.searchTypes?.length) return engine.searchTypes;
  return [engine.primaryType ?? "web"];
};

export const primaryType = (types: string[]): string =>
  types.length > 0 ? types[0] : "web";

export const extraTypeLabels = (engine: ExtensionMeta): string[] => {
  const types = engineTypes(engine);
  const primary = primaryType(types).toLowerCase();
  return types
    .filter((type) => type.toLowerCase() !== primary)
    .map((type) => typeLabel(type.toLowerCase()));
};
