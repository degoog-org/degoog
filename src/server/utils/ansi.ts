const _noColor = !!process.env.NO_COLOR;
const _ansi = (code: string): string => (_noColor ? "" : code);
export const ANSI_BLUE = _ansi("\x1b[38;2;66;133;244m");
export const ANSI_RED = _ansi("\x1b[38;2;234;67;53m");
export const ANSI_YELLOW = _ansi("\x1b[38;2;251;188;5m");
export const ANSI_GREEN = _ansi("\x1b[38;2;52;168;83m");
export const ANSI_BOLD = _ansi("\x1b[1m");
export const ANSI_RESET = _ansi("\x1b[0m");
export const ANSI_GRAY = _ansi("\x1b[90m");
