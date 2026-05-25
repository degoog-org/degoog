const LOG_LEVEL = process.env.LOG_LEVEL?.toLowerCase() || "info";
const LOG_TRANSLATION = process.env.LOG_TRANSLATION?.toLowerCase() === "true";
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
  translation: "\x1b[35m",
};

const NO_COLOR = !!process.env.NO_COLOR;
const color = (c: string): string => (NO_COLOR ? "" : c);
const RESET = NO_COLOR ? "" : "\x1b[0m";

const fmt = (namespace: string, ...args: unknown[]) =>
  args.map((e) => (e instanceof Error ? ["\n", e] : [e])).flat();

const PATTERN_MAX_PERIOD = 4;
const IS_TTY = process.stdout.isTTY === true;

type ScanState = { mode: "scanning"; buf: string[] };
type CycleState = { mode: "repeating"; pattern: string[]; pos: number; cycles: number };
type LogState = ScanState | CycleState;

let _logState: LogState = { mode: "scanning", buf: [] };
let _cycleLineActive = false;

const msgKey = (level: string, namespace: string, args: unknown[]): string => {
  try {
    return `${level}|${namespace}|${JSON.stringify(args)}`;
  } catch {
    return `${level}|${namespace}|${String(args)}`;
  }
};

const tryCycle = (buf: string[]): string[] | null => {
  for (let p = 1; p <= PATTERN_MAX_PERIOD; p++) {
    if (buf.length < p * 2) continue;
    const prev = buf.slice(buf.length - p * 2, buf.length - p);
    const curr = buf.slice(buf.length - p);
    if (prev.every((m, i) => m === curr[i])) return curr.slice();
  }
  return null;
};

const printCycleCount = (cycles: number, period: number) => {
  const suffix = period > 1 ? ` (${period}-line cycle)` : "";
  if (IS_TTY && _cycleLineActive) {
    process.stdout.write(`\x1b[1A\r\x1b[2K${color("\x1b[90m")}  ↑ x${cycles}${suffix}${RESET}\n`);
  } else {
    process.stdout.write(`${color("\x1b[90m")}  ↑ x${cycles}${suffix}${RESET}\n`);
    _cycleLineActive = true;
  }
};

const emit = (key: string, write: () => void) => {
  if (_logState.mode === "repeating") {
    if (key === _logState.pattern[_logState.pos]) {
      _logState.pos = (_logState.pos + 1) % _logState.pattern.length;
      if (_logState.pos === 0) {
        _logState.cycles++;
        printCycleCount(_logState.cycles, _logState.pattern.length);
      }
      return;
    }
    _cycleLineActive = false;
    _logState = { mode: "scanning", buf: [] };
  }

  write();
  const s = _logState as ScanState;
  s.buf.push(key);
  const pattern = tryCycle(s.buf);
  if (pattern) {
    _cycleLineActive = false;
    _logState = { mode: "repeating", pattern, pos: 0, cycles: 2 };
    printCycleCount(2, pattern.length);
  } else if (s.buf.length > PATTERN_MAX_PERIOD * 2) {
    s.buf.shift();
  }
};

export const logger: Record<string, (namespace: string, ...args: unknown[]) => void> = {
  ...LEVELS.reduce(
    (acc, level) => {
      acc[level] = (namespace: string, ...args: unknown[]) => {
        if (LEVELS.indexOf(LOG_LEVEL) < LEVELS.indexOf(level)) return;
        emit(msgKey(level, namespace, args), () =>
          CONSOLE_LEVELS[level](
            `${color(CONSOLE_COLORS[level])}${level.toUpperCase()} [${namespace}]${RESET}`,
            ...fmt(namespace, ...args),
          ),
        );
      };
      return acc;
    },
    {} as Record<string, (namespace: string, ...args: unknown[]) => void>,
  ),
  translation: (namespace: string, ...args: unknown[]) => {
    if (!LOG_TRANSLATION) return;
    emit(msgKey("translation", namespace, args), () =>
      console.debug(
        `${color(CONSOLE_COLORS.translation)}TRANSLATION [${namespace}]${RESET}`,
        ...fmt(namespace, ...args),
      ),
    );
  },
};
