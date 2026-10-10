import { makeExtID } from "../../../utils/extension-support/extension-id";
import { join } from "path";

export const searxEnginesDir = (): string =>
  process.env.DEGOOG_SEARX_ENGINES_DIR ??
  join(process.env.DEGOOG_DATA_DIR ?? join(process.cwd(), "data"), "searx", "engines");

export const searxEngineId = (code: string): string =>
  makeExtID(`searx-${code}`, "engine");
