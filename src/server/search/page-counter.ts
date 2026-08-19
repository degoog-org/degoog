import type { EnginePagination } from "../../shared/search-types";

export interface PageCounter {
  report: (info: EnginePagination) => void;
  total: () => number | undefined;
}

export const sanePage = (raw: unknown): number => {
  const page = Math.floor(Number(raw));
  return Number.isFinite(page) && page > 1 ? page : 1;
};

export const makePageCounter = (): PageCounter => {
  let declared: number | undefined;
  return {
    report: (info) => {
      const { total } = info;
      if (typeof total !== "number" || !Number.isFinite(total)) return;
      declared = Math.max(1, Math.floor(total));
    },
    total: () => declared,
  };
};

export const agreedPageTotal = (
  declared: (number | undefined)[],
): number | undefined => {
  if (declared.length === 0) return undefined;
  if (declared.some((total) => total === undefined)) return undefined;
  return Math.max(...(declared as number[]));
};
