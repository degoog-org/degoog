import { describe, expect, test } from "bun:test";
import { join } from "path";

const LOGGER = join(import.meta.dir, "../../../src/server/utils/logger.ts");

const runScript = async (
  body: string,
  kill = false,
  extraEnv: Record<string, string> = {},
): Promise<string[]> => {
  const script = `import { logger } from ${JSON.stringify(LOGGER)};\n${body}`;
  const proc = Bun.spawn(["bun", "-e", script], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, LOG_LEVEL: "info", NO_COLOR: "1", ...extraEnv },
  });
  if (kill) {
    const reader = proc.stdout.getReader();
    const { value } = await reader.read();
    proc.kill("SIGKILL");
    await proc.exited;
    return new TextDecoder().decode(value).split("\n").filter(Boolean);
  }
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out.split("\n").filter(Boolean);
};

describe("logger without a TTY", () => {
  test("prints the first occurrence at once and summarises repeats", async () => {
    const lines = await runScript(`
logger.info("ns", "same");
logger.info("ns", "same");
logger.info("ns", "same");
logger.info("ns", "other");
logger.info("ns", "last");
`);

    expect(lines).toEqual([
      "INFO [ns] same",
      "INFO [ns] same x3",
      "INFO [ns] other",
      "INFO [ns] last",
    ]);
  });

  test("the repeat summary is flushed on exit", async () => {
    const lines = await runScript(`
logger.info("ns", "again");
logger.info("ns", "again");
`);

    expect(lines).toEqual(["INFO [ns] again", "INFO [ns] again x2"]);
  });

  test("a line survives a SIGKILL right after it is logged", async () => {
    const lines = await runScript(
      `logger.info("ns", "dying words");\nawait Bun.sleep(10000);`,
      true,
    );

    expect(lines).toEqual(["INFO [ns] dying words"]);
  });

  test("translation lines print when LOG_TRANSLATION is on", async () => {
    const lines = await runScript(
      `logger.translation("translation", "missing key");`,
      false,
      { LOG_TRANSLATION: "true" },
    );

    expect(lines).toEqual(["TRANSLATION [translation] missing key"]);
  });
});
