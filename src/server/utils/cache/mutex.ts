export type RunExclusive = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Minimal promise-based mutex. Tasks queue and run one at a time in call
 * order. A thrown error releases the lock for the next task.
 */
export const createMutex = (): RunExclusive => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
};
