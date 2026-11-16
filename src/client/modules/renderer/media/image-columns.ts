import type { ScoredResult } from "../../../../shared/search-types";

export interface ColumnLoad {
  height: number;
  cards: number;
}

const DEFAULT_CARD_HEIGHT = 1;

export const shortestColumn = (loads: readonly ColumnLoad[]): number => {
  let best = 0;
  for (let i = 1; i < loads.length; i++) {
    const { height, cards } = loads[i];
    const lead = loads[best];
    if (height < lead.height || (height === lead.height && cards < lead.cards)) {
      best = i;
    }
  }
  return best;
};

export const averageCardHeight = (loads: readonly ColumnLoad[]): number => {
  const cards = loads.reduce((sum, load) => sum + load.cards, 0);
  const height = loads.reduce((sum, load) => sum + load.height, 0);
  return cards > 0 && height > 0 ? height / cards : DEFAULT_CARD_HEIGHT;
};

export const keepPlacedOrder = (
  placed: readonly ScoredResult[],
  batch: readonly ScoredResult[],
): ScoredResult[] => {
  const latest = new Map(batch.map((result) => [result.url, result]));
  const placedUrls = new Set(placed.map((result) => result.url));
  return [
    ...placed.map((result) => latest.get(result.url) ?? result),
    ...batch.filter((result) => !placedUrls.has(result.url)),
  ];
};
