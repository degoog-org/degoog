import { getAdapter } from "./db-factory";
import { logger } from "../utils/logger";

export const discoverTypes = (): string[] => getAdapter().discoverTypes();

export const checkpointType = (type: string): void => {
  void getAdapter().checkpoint(type).catch((err) => {
    logger.warn("indexer", `checkpoint failed for type=${type}`, err);
  });
};

export const closeAllDbs = async (): Promise<void> => {
  await getAdapter().close();
};
