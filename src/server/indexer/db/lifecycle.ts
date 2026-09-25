import { getAdapter } from "./factory";

export const discoverTypes = (): string[] => getAdapter().discoverTypes();

export const closeAllDbs = async (): Promise<void> => {
  await getAdapter().close();
};
