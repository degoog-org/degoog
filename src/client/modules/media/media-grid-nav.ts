import { state } from "../../state";

const _isMediaLoaded = (idx: number, cardSelector: string): boolean => {
  const card = document.querySelector<HTMLElement>(
    `${cardSelector}[data-idx="${idx}"]`,
  );
  if (!card || card.style.display === "none") return false;

  const thumbSelector =
    cardSelector === ".video-card" ? ".video-thumb" : ".image-thumb";
  const thumb = card.querySelector<HTMLImageElement>(thumbSelector);
  if (!thumb || thumb.style.display === "none") return false;

  return thumb.complete && thumb.naturalWidth > 0;
};

export const pickOtherMedia = (
  excludeIdx: number,
  count: number,
  cardSelector: string,
): number[] => {
  const pool: number[] = [];
  state.currentResults.forEach((r, i) => {
    if (i === excludeIdx) return;
    if (!(r.thumbnail || r.imageUrl)) return;
    if (!_isMediaLoaded(i, cardSelector)) return;
    pool.push(i);
  });

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count);
};

const _visibleCards = (parent: Element, selector: string): HTMLElement[] =>
  Array.from(parent.querySelectorAll<HTMLElement>(selector)).filter(
    (c) => c.offsetParent !== null,
  );

export const findColumnTarget = (
  selector: string,
  idx: number,
  direction: -1 | 1,
): HTMLElement | null => {
  const currentCard = document.querySelector<HTMLElement>(
    `${selector}[data-idx="${idx}"]`,
  );
  if (!currentCard) return null;

  const column = currentCard.closest(
    ".image-column, .video-column",
  ) as HTMLElement | null;
  if (!column) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= state.currentResults.length) return null;
    return document.querySelector<HTMLElement>(
      `${selector}[data-idx="${newIdx}"]`,
    );
  }

  const grid = column.parentElement;
  if (!grid) return null;

  const columns = Array.from(grid.children) as HTMLElement[];
  const colIdx = columns.indexOf(column);
  const cardsInCol = _visibleCards(column, selector);
  const cardPosInCol = cardsInCol.indexOf(currentCard);

  const nextColIdx = colIdx + direction;
  if (nextColIdx >= 0 && nextColIdx < columns.length) {
    const nextCards = _visibleCards(columns[nextColIdx], selector);
    if (nextCards.length === 0) return null;
    return nextCards[Math.min(cardPosInCol, nextCards.length - 1)];
  }

  if (direction === 1) {
    const firstCards = _visibleCards(columns[0], selector);
    const target = cardPosInCol + 1;
    if (target < firstCards.length) return firstCards[target];
  } else {
    const lastCards = _visibleCards(columns[columns.length - 1], selector);
    const target = cardPosInCol - 1;
    if (target >= 0) return lastCards[target];
  }

  return null;
};
