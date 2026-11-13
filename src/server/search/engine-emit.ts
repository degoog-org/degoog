import type { SearchResult } from "../../shared/search-types";
import { ENGINE_TIMEOUT_REASON } from "./engine-timeout";
import { normalizeUrl } from "./url-normalize";

export interface EmitLimits {
  idleMs: number;
  budgetMs: number;
  abort: () => void;
}

export interface EmittedRun {
  results: SearchResult[];
  partial: boolean;
  error?: unknown;
}

export interface EmitProgress {
  expected?: number;
}

export interface EngineEmitter {
  emit: (batch: SearchResult[], progress?: EmitProgress) => void;
  settle: (work: Promise<SearchResult[]>, limits: EmitLimits) => Promise<EmittedRun>;
}

const _keyOf = (result: SearchResult | undefined): string =>
  result && typeof result.url === "string" && result.url ? normalizeUrl(result.url) : "";

const _mergeInOrder = (
  returned: SearchResult[],
  emitted: SearchResult[],
): SearchResult[] => {
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const result of [...returned, ...emitted]) {
    const key = _keyOf(result);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(result);
  }
  return merged;
};

const _expectedOf = (progress: EmitProgress | undefined): number => {
  const expected = Number(progress?.expected);
  return Number.isInteger(expected) && expected > 0 ? expected : 0;
};

export const makeEngineEmitter = (
  onPartial?: (results: SearchResult[], expected?: number) => void,
): EngineEmitter => {
  const seen = new Set<string>();
  const collected: SearchResult[] = [];
  let expected = 0;
  let open = true;
  let onActivity = (): void => {};

  const emit = (batch: SearchResult[], progress?: EmitProgress): void => {
    if (!open || !Array.isArray(batch)) return;
    expected = Math.max(expected, _expectedOf(progress));
    let added = false;
    for (const result of batch) {
      const key = _keyOf(result);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      collected.push(result);
      added = true;
    }
    if (!added) return;
    onActivity();
    onPartial?.([...collected], expected ? Math.max(expected, collected.length) : undefined);
  };

  const settle = (
    work: Promise<SearchResult[]>,
    { idleMs, budgetMs, abort }: EmitLimits,
  ): Promise<EmittedRun> =>
    new Promise((resolve, reject) => {
      let idle: ReturnType<typeof setTimeout> | undefined;

      const close = (): void => {
        open = false;
        onActivity = () => {};
        clearTimeout(idle);
        clearTimeout(budget);
      };

      const keepOrReject = (error: unknown): void => {
        if (collected.length > 0) resolve({ results: [...collected], partial: true, error });
        else reject(error);
      };

      const expire = (): void => {
        if (!open) return;
        close();
        keepOrReject(new Error(ENGINE_TIMEOUT_REASON));
        abort();
      };

      const arm = (): void => {
        clearTimeout(idle);
        idle = setTimeout(expire, idleMs);
      };

      onActivity = arm;
      arm();
      const budget = setTimeout(expire, Math.max(budgetMs, idleMs));

      work.then(
        (returned) => {
          if (!open) return;
          close();
          if (collected.length === 0) {
            resolve({ results: returned, partial: false });
            return;
          }
          const list = Array.isArray(returned) ? returned : [];
          resolve({ results: _mergeInOrder(list, collected), partial: false });
        },
        (err: unknown) => {
          if (!open) return;
          close();
          keepOrReject(err);
        },
      );
    });

  return { emit, settle };
};
