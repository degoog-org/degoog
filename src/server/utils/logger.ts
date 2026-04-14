const LOG_LEVEL = process.env.LOG_LEVEL?.toLowerCase() || "info";
const LEVELS = ["fatal", "error", "warn", "info", "log", "debug"];
const CONSOLE_LEVELS: Record<string, (...args: unknown[]) => void> = {
  fatal: console.error,
  error: console.error,
  warn: console.warn,
  info: console.info,
  log: console.log,
  debug: console.debug,
};
const CONSOLE_COLORS: Record<string, string> = {
  fatal: "\x1b[31m",
  error: "\x1b[31m",
  warn: "\x1b[33m",
  info: "\x1b[36m",
  log: "\x1b[37m",
  debug: "\x1b[90m",
};

export const logger = LEVELS.reduce(
  (acc, level) => {
    acc[level] = (namespace: string, ...args: unknown[]) => {
      if (LEVELS.indexOf(LOG_LEVEL) < LEVELS.indexOf(level)) return;
      CONSOLE_LEVELS[level](
        `${CONSOLE_COLORS[level]}${level.toUpperCase()} [${namespace}]\x1b[0m`,
        ...args.map((e) => (e instanceof Error ? ["\n", e] : [e])).flat(),
      );
    };

    return acc;
  },
  {} as Record<string, (namespace: string, ...args: unknown[]) => void>,
);
