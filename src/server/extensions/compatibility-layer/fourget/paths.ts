import { join } from "path";

const _dataDir = (): string =>
  process.env.DEGOOG_DATA_DIR ?? join(process.cwd(), "data");

export const fourgetRoot = (): string =>
  process.env.DEGOOG_FOURGET_DIR ?? join(_dataDir(), "fourget");

export const scrapersDir = (): string => join(fourgetRoot(), "scraper");

export const sharedLibDir = (): string => join(fourgetRoot(), "lib");

export const stagingRoot = (): string => join(fourgetRoot(), ".run");