import { logger } from "../../../utils/logger";

const NS = "searx-compat";
const PROBE_TIMEOUT_MS = 10_000;
const PROBE_TTL_MS = 60_000;

export enum PythonLib {
  Babel = "babel",
  DateUtil = "dateutil",
  Lxml = "lxml",
}

export const LIB_PACKAGES: Record<PythonLib, string> = {
  [PythonLib.Babel]: "Babel",
  [PythonLib.DateUtil]: "python-dateutil",
  [PythonLib.Lxml]: "lxml",
};

const ALL_LIBS = Object.values(PythonLib);

const PROBE_SNIPPET = [
  "import importlib.util as u, json, sys",
  "print(json.dumps([m for m in sys.argv[1:] if u.find_spec(m) is None]))",
].join("; ");

const _probe = async (): Promise<PythonLib[]> => {
  const proc = Bun.spawn(
    [process.env.DEGOOG_PYTHON_BIN ?? "python3", "-c", PROBE_SNIPPET, ...ALL_LIBS],
    { stdout: "pipe", stderr: "pipe", timeout: PROBE_TIMEOUT_MS, killSignal: "SIGKILL" },
  );
  const [out, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(`python probe exited with ${exitCode}`);
  const parsed: unknown = JSON.parse(out.trim() || "[]");
  if (!Array.isArray(parsed)) throw new Error("python probe returned an odd payload");
  return ALL_LIBS.filter((lib) => parsed.includes(lib));
};

let _cached: { at: number; libs: PythonLib[] } | null = null;

export const missingPythonLibs = async (): Promise<PythonLib[]> => {
  if (_cached && Date.now() - _cached.at < PROBE_TTL_MS) return _cached.libs;
  let libs: PythonLib[];
  try {
    libs = await _probe();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(NS, `could not check python libs, assuming none are there: ${message}`);
    libs = [...ALL_LIBS];
  }
  _cached = { at: Date.now(), libs };
  return libs;
};
