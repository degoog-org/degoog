import { getImageQueryCommands } from "../extensions/commands/registry";
import type { BangCommand } from "../types/extension";
import type { SearchImage } from "../types/search";
import { logger } from "../utils/logger";
import { parseImageQuery } from "./search-image";

export interface ImageQueryOutcome {
  query?: string;
  error?: string;
}

export type ImageQueryProvider = BangCommand & {
  imageQuery: NonNullable<BangCommand["imageQuery"]>;
};

const NS = "image-query";
const NO_QUERY = "The image could not be turned into a search query";
const TIMED_OUT = "Describing the image took too long";
export const IMAGE_QUERY_TIMEOUT_MS = 30_000;

export const imageQueryProvider = async (): Promise<ImageQueryProvider | undefined> =>
  (await getImageQueryCommands())[0] as ImageQueryProvider | undefined;

export const canQueryImages = async (): Promise<boolean> =>
  !!(await imageQueryProvider());

const _untilAborted = (signal: AbortSignal): Promise<never> =>
  new Promise((_, reject) => {
    const fail = () => reject(signal.reason);
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });

export const queryImage = async (
  provider: ImageQueryProvider,
  image: SearchImage,
  text: string,
  opts: { lang?: string; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ImageQueryOutcome> => {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? IMAGE_QUERY_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  try {
    const query = parseImageQuery(
      await Promise.race([
        provider.imageQuery(image, { text: text.trim(), lang: opts.lang, signal }),
        _untilAborted(signal),
      ]),
    );
    return query ? { query } : { error: NO_QUERY };
  } catch (err) {
    if (opts.signal?.aborted) return {};
    if (timeout.aborted) {
      logger.warn(NS, `${provider.name} timed out describing the image`);
      return { error: TIMED_OUT };
    }
    logger.warn(NS, `${provider.name} could not describe the image`, err);
    return { error: err instanceof Error && err.message ? err.message : NO_QUERY };
  }
};
