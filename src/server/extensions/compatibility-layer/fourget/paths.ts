import { join } from "path";
import { dataDir } from "../../../utils/paths";

const fourgetRoot = (): string =>
  process.env.DEGOOG_FOURGET_DIR ?? join(dataDir(), "fourget");

export const scrapersDir = (): string => join(fourgetRoot(), "scraper");

export const sharedLibDir = (): string => join(fourgetRoot(), "lib");

export const stagingRoot = (): string => join(fourgetRoot(), ".run");