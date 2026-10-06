import { state } from "../../../state";
import type { ScoredResult } from "../../../../shared/search-types";
import { remapCurrentMediaIdx } from "../../media/media";

export type ResultBadge = { text: string; tone?: "strong" | "weak" };

export type ResultRanking = {
  compare?: (a: ScoredResult, b: ScoredResult) => number;
  hidden?: (result: ScoredResult) => boolean;
  badge?: (result: ScoredResult) => ResultBadge | string | null | undefined;
};

export type ResultsApi = {
  current: () => { query: string; type: string };
  list: () => ScoredResult[];
  setRanking: (id: string, ranking: ResultRanking | null) => void;
  refresh: () => void;
};

export type SearchApi = (query: string, type?: string) => void;

declare global {
  interface Window {
    degoog?: { results?: ResultsApi; search?: SearchApi };
  }
}

export const RANK_HIDDEN_CLASS = "degoog-rank-hidden";
export const RESULTS_API_READY = "degoog-results-api-ready";
export const RESULTS_READY = "degoog-results-ready";

const BADGE_CLASS = "degoog-rank-badge";
const GRIDS: ReadonlyArray<{ grid: string; card: string }> = [
  { grid: ".image-grid", card: ".image-card" },
  { grid: ".video-grid", card: ".video-card" },
];

const _rankings = new Map<string, { ranking: ResultRanking; seq: number }>();
const _arrival = new WeakMap<ScoredResult, number>();
let _arrivalSeq = 0;
let _relayout: ((grid: HTMLElement) => void) | null = null;

export const registerRankingRelayout = (
  fn: (grid: HTMLElement) => void,
): void => {
  _relayout = fn;
};

const _activeRanking = (): ResultRanking | undefined => {
  for (const [id, entry] of _rankings) {
    if (entry.seq !== state.searchSeq) _rankings.delete(id);
  }
  return Array.from(_rankings.values()).at(-1)?.ranking;
};

const _safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch (err) {
    console.warn("[ranking] a result ranking threw", err);
    return fallback;
  }
};

const _badgeOf = (
  ranking: ResultRanking | undefined,
  result: ScoredResult,
): ResultBadge | null => {
  const badge = ranking?.badge
    ? _safe(() => ranking.badge!(result), null)
    : null;
  if (!badge) return null;
  if (typeof badge === "string") return { text: badge };
  return typeof badge.text === "string" && badge.text ? badge : null;
};

const _paintBadge = (card: HTMLElement, badge: ResultBadge | null): void => {
  let node = card.querySelector<HTMLElement>(`:scope > .${BADGE_CLASS}`);
  if (!badge) {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement("span");
    node.className = BADGE_CLASS;
    card.appendChild(node);
  }
  node.textContent = badge.text;
  if (badge.tone) node.dataset.tone = badge.tone;
  else delete node.dataset.tone;
};

const _sorted = (
  results: ScoredResult[],
  ranking: ResultRanking | undefined,
  hidden: Set<ScoredResult>,
): ScoredResult[] => {
  for (const r of results) {
    if (!_arrival.has(r)) _arrival.set(r, _arrivalSeq++);
  }
  const compare = ranking?.compare;
  return [...results].sort(
    (a, b) =>
      Number(hidden.has(a)) - Number(hidden.has(b)) ||
      (compare ? _safe(() => compare(a, b), 0) || 0 : 0) ||
      (_arrival.get(a) ?? 0) - (_arrival.get(b) ?? 0),
  );
};

export const applyResultRanking = (): void => {
  const target = GRIDS.map((g) => ({
    ...g,
    el: document.querySelector<HTMLElement>(`#results-list ${g.grid}`),
  })).find((g) => g.el);
  if (!target?.el) return;

  const results = state.currentResults;
  const cards = new Map<ScoredResult, HTMLElement>();
  target.el
    .querySelectorAll<HTMLElement>(target.card)
    .forEach((card) => {
      const result = results[Number(card.dataset.idx)];
      if (result) cards.set(result, card);
    });

  const ranking = _activeRanking();
  const hidden = new Set(
    ranking?.hidden
      ? results.filter((r) => _safe(() => ranking.hidden!(r), false))
      : [],
  );
  const sorted = _sorted(results, ranking, hidden);
  const oldIdx = new Map(results.map((r, i) => [r, i]));
  const moved = new Map<number, number>();
  sorted.forEach((result, newIdx) => {
    moved.set(oldIdx.get(result) ?? newIdx, newIdx);
    const card = cards.get(result);
    if (!card) return;
    card.dataset.idx = String(newIdx);
    card.classList.toggle(RANK_HIDDEN_CLASS, hidden.has(result));
    _paintBadge(card, _badgeOf(ranking, result));
  });

  state.currentResults = sorted;
  remapCurrentMediaIdx((old) => moved.get(old) ?? old);
  _relayout?.(target.el);
};

const _api: ResultsApi = {
  current: () => ({ query: state.currentQuery, type: state.currentType }),
  list: () => [...state.currentResults],
  setRanking: (id, ranking) => {
    if (typeof id !== "string" || !id) return;
    _rankings.delete(id);
    if (ranking) _rankings.set(id, { ranking, seq: state.searchSeq });
    applyResultRanking();
  },
  refresh: () => applyResultRanking(),
};

export const exposeResultsApi = (search: SearchApi): void => {
  window.degoog = { ...(window.degoog ?? {}), results: _api, search };
  window.dispatchEvent(new CustomEvent(RESULTS_API_READY));
};

export const hasResultRanking = (): boolean => !!_activeRanking();
