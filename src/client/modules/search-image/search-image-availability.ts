import { ENGINE_INPUT } from "../../../shared/engine-input";
import { getEngines, getRegistry } from "../../utils/search/engines";

const IMAGE_TYPE = "images";

export const imageSearchAvailable = async (): Promise<boolean> => {
  try {
    const [registry, enabled] = await Promise.all([getRegistry(), getEngines()]);
    return registry.engines.some(
      (engine) =>
        enabled[engine.id] &&
        (engine.input === ENGINE_INPUT.IMAGE ||
          (!!registry.imageQuery && engine.searchTypes.includes(IMAGE_TYPE))),
    );
  } catch (err) {
    console.warn("[search-image] could not tell whether image search is available", err);
    return false;
  }
};
