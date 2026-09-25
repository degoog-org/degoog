import { mkdir, rename, unlink, writeFile } from "fs/promises";
import { dirname } from "path";
import { randomUUID } from "crypto";

/**
 * Write pretty JSON to a temp file in the same directory, then rename over
 * the target. The rename is atomic on the same filesystem, so a crash or
 * concurrent write cannot leave a half-written file at `path`. The temp name
 * mixes pid and a uuid so two writes in the same millisecond cannot collide.
 */
export const writeJsonAtomic = async (
  path: string,
  value: unknown,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2), "utf-8");
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
};
