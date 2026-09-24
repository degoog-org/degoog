import { rm, realpath } from "fs/promises";
import { join, relative, isAbsolute } from "path";
import { logger } from "../../utils/logger";
import { getStoreDir } from "./persistence";

const CLONE_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const DEGOOG_BETA_STORE = process.env.DEGOOG_BETA_STORE === "1";
const BETA_BRANCH = "develop";
const STALE_LOCK_FILES = ["shallow.lock", "index.lock"];

interface GitRun {
  exit: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const runGit = async (
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<GitRun> => {
  const proc = Bun.spawn(["git", ...args], { cwd: opts.cwd, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer =
    opts.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, opts.timeoutMs);
  try {
    const [exit, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { exit, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timer);
  }
};

const sanitizeGitError = (raw: string): string => {
  if (!raw) return raw;
  return raw
    .replaceAll(getStoreDir(), "<store>")
    .replaceAll(process.cwd(), "<workdir>")
    .replace(/'\/[^'\n]*'/g, "'<path>'")
    .replace(/\/[A-Za-z0-9_./-]+\/(?=\.git\b)/g, "<path>/")
    .trim();
};

const isLockError = (stderr: string): boolean =>
  /shallow\.lock|shallow file has changed|index\.lock|another git process/i.test(stderr);

const isInsideStore = async (repoPath: string): Promise<boolean> => {
  try {
    const root = await realpath(getStoreDir());
    const target = await realpath(repoPath);
    const rel = relative(root, target);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  } catch (err) {
    logger.warn("store:repo", `could not resolve repo path ${repoPath}`, err);
    return false;
  }
};

const cleanGitLocks = async (repoPath: string): Promise<void> => {
  if (!(await isInsideStore(repoPath))) {
    logger.warn("store:repo", `refusing to clean locks outside store dir: ${repoPath}`);
    return;
  }
  const gitDir = join(repoPath, ".git");
  await Promise.all(
    STALE_LOCK_FILES.map((name) =>
      rm(join(gitDir, name), { force: true }).catch((err) =>
        logger.debug("store:repo", `could not remove stale ${name} in ${repoPath}`, err),
      ),
    ),
  );
};

const headBranch = async (repoPath: string): Promise<string> =>
  (await runGit(["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();

const runFetchRef = (repoPath: string, branch: string): Promise<GitRun> =>
  runGit(
    ["-C", repoPath, "fetch", "--depth", "1", "origin", `+${branch}:refs/remotes/origin/${branch}`],
    { timeoutMs: FETCH_TIMEOUT_MS },
  );

export const fetchRef = async (
  repoPath: string,
  branch: string,
): Promise<{ ok: boolean; notFound: boolean; error: string }> => {
  let run = await runFetchRef(repoPath, branch);
  if (run.exit !== 0 && !run.timedOut && isLockError(run.stderr)) {
    logger.warn("store:repo", `git lock detected during fetch, clearing stale locks and retrying`);
    await cleanGitLocks(repoPath);
    run = await runFetchRef(repoPath, branch);
  }
  if (run.exit === 0) return { ok: true, notFound: false, error: "" };
  const notFound = /couldn't find remote ref|remote ref does not exist|invalid refspec/i.test(
    run.stderr,
  );
  return {
    ok: false,
    notFound,
    error: run.timedOut ? "Fetch timed out" : sanitizeGitError(run.stderr),
  };
};

const switchBranch = async (
  repoPath: string,
  branch: string,
): Promise<{ ok: boolean; notFound: boolean }> => {
  const fetched = await fetchRef(repoPath, branch);
  if (!fetched.ok) return { ok: false, notFound: fetched.notFound };
  const run = await runGit(["-C", repoPath, "checkout", "-B", branch, `origin/${branch}`]);
  return { ok: run.exit === 0, notFound: false };
};

export const hardReset = async (
  repoPath: string,
  ref: string,
): Promise<{ ok: boolean; error: string }> => {
  const run = await runGit(["-C", repoPath, "reset", "--hard", ref]);
  if (run.exit === 0) return { ok: true, error: "" };
  return { ok: false, error: sanitizeGitError(run.stderr) };
};

export const syncBranch = async (repoPath: string): Promise<void> => {
  const current = await headBranch(repoPath);
  if (DEGOOG_BETA_STORE) {
    if (current === BETA_BRANCH) return;
    const result = await switchBranch(repoPath, BETA_BRANCH);
    if (!result.ok) {
      if (result.notFound) {
        logger.debug(
          "store:branch",
          `repo has no "${BETA_BRANCH}" branch, staying on "${current}" - normal for third-party repos`,
        );
      } else {
        logger.warn(
          "store:branch",
          `failed to switch repo to "${BETA_BRANCH}", staying on "${current}"`,
        );
      }
    }
    return;
  }
  if (current === BETA_BRANCH) {
    const main = await switchBranch(repoPath, "main");
    const reverted = main.ok || (await switchBranch(repoPath, "master")).ok;
    if (!reverted) {
      logger.warn("store:branch", `could not revert repo off ${BETA_BRANCH}`);
    }
  }
};

export const resolveTrackedBranch = async (repoPath: string): Promise<string> => {
  const useBeta =
    DEGOOG_BETA_STORE &&
    (await runGit(["-C", repoPath, "rev-parse", "--verify", `origin/${BETA_BRANCH}`])).exit === 0;
  return useBeta ? BETA_BRANCH : await headBranch(repoPath);
};

export const behindCount = async (repoPath: string, remoteRef: string): Promise<number> => {
  const run = await runGit(["-C", repoPath, "rev-list", "--count", `HEAD..${remoteRef}`]);
  if (run.exit !== 0) return 0;
  const n = parseInt(run.stdout.trim(), 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
};

export const cloneRepo = async (url: string, dest: string): Promise<void> => {
  const useBeta =
    DEGOOG_BETA_STORE &&
    (
      await runGit(["ls-remote", "--heads", url, BETA_BRANCH], { timeoutMs: FETCH_TIMEOUT_MS })
    ).stdout.trim().length > 0;
  const run = await runGit(
    ["clone", "--depth", "1", ...(useBeta ? ["--branch", BETA_BRANCH] : []), url, dest],
    { cwd: getStoreDir(), timeoutMs: CLONE_TIMEOUT_MS },
  );
  if (run.timedOut) throw new Error("Clone timed out");
  if (run.exit !== 0) {
    throw new Error(sanitizeGitError(run.stderr) || `Git clone failed with code ${run.exit}`);
  }
};
