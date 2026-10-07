import { randomUUID } from "crypto";
import { rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { TransportFetchOptions } from "../../../types/extension";
import { logger } from "../../../utils/logger";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

const _bodyOf = (options: TransportFetchOptions) => {
  const method = (options.method ?? "GET").toUpperCase();
  if (!BODY_METHODS.has(method) || !options.body) return null;
  return options.body.length > 0 ? options.body : null;
};

export const withCurlBodyArgs = async <T>(
  options: TransportFetchOptions,
  run: (bodyArgs: string[]) => Promise<T>,
): Promise<T> => {
  const body = _bodyOf(options);
  if (!body) return run([]);
  const path = join(tmpdir(), `degoog-curl-${randomUUID()}`);
  await writeFile(path, body, { mode: 0o600 });
  try {
    return await run(["--data-binary", `@${path}`]);
  } finally {
    await rm(path, { force: true }).catch((err) =>
      logger.debug("transport:curl", "could not remove body file", err),
    );
  }
};
