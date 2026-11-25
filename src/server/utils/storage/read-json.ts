import { readFile, rename } from "fs/promises";
import { logger } from "../logger";

const _isMissing = (err: unknown): boolean =>
  (err as NodeJS.ErrnoException).code === "ENOENT";

const _stamp = (): string =>
  new Date().toISOString().replace(/[:.]/g, "-");

export const quarantineFile = async (
  namespace: string,
  path: string,
  err: unknown,
): Promise<string> => {
  const kept = `${path}.corrupt-${_stamp()}`;
  try {
    await rename(path, kept);
    logger.error(
      namespace,
      `${path} could not be parsed and was moved to ${kept} rather than overwritten. ` +
        `Defaults are in use until it is restored by hand.`,
      err,
    );
    return kept;
  } catch (renameErr) {
    logger.error(
      namespace,
      `${path} could not be parsed and could not be moved aside either. ` +
        `Refusing to continue rather than overwrite it.`,
      renameErr,
    );
    throw renameErr;
  }
};

export interface QuarantineRead<T> {
  value: T | null;
  quarantinedAt: string | null;
}

export const readJsonOrQuarantineDetailed = async <T>(
  namespace: string,
  path: string,
): Promise<QuarantineRead<T>> => {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if (_isMissing(err)) return { value: null, quarantinedAt: null };
    throw err;
  }
  try {
    return { value: JSON.parse(raw) as T, quarantinedAt: null };
  } catch (err) {
    return { value: null, quarantinedAt: await quarantineFile(namespace, path, err) };
  }
};

export const readJsonOrQuarantine = async <T>(
  namespace: string,
  path: string,
): Promise<T | null> =>
  (await readJsonOrQuarantineDetailed<T>(namespace, path)).value;
