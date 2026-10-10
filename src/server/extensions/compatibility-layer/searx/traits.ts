import { readFile } from "fs/promises";
import { logger } from "../../../utils/logger";
import { isRecord } from "../../../../shared/utils/is-record";
import { coerceRegions } from "../../engines/search-types";

const NS = "searx-compat";

export const TRAITS_SUFFIX = ".traits.json";

const _countryOf = (tag: string): string => tag.slice(tag.lastIndexOf("-") + 1);

export const traitRegions = async (
  enginePath: string,
): Promise<string[] | undefined> => {
  const traitsPath = enginePath.replace(/\.py$/, TRAITS_SUFFIX);
  try {
    const traits: unknown = JSON.parse(await readFile(traitsPath, "utf-8"));
    if (!isRecord(traits) || !isRecord(traits.regions)) return undefined;
    return coerceRegions(Object.keys(traits.regions).map(_countryOf));
  } catch (err) {
    logger.debug(NS, `no readable SearX traits next to ${enginePath}`, err);
    return undefined;
  }
};
