const DRAG_THRESHOLD_PX = 6;
const SETTLE_MS = 160;
const ACTIVE_CLASS = "degoog-dragging";
const LIST_ACTIVE_CLASS = "degoog-drag-active";

export interface DragOrderConfig {
  itemSelector: string;
  handleSelector: string;
  onReorder: (list: HTMLElement, item: HTMLElement) => void;
}

const clearTween = (el: HTMLElement): void => {
  el.style.transition = "";
  el.style.transform = "";
};

export const initDragOrder = (
  list: HTMLElement,
  config: DragOrderConfig,
): void => {
  let dragged: HTMLElement | null = null;
  let pointerId = -1;
  let startY = 0;
  let grabOffset = 0;
  let active = false;

  const items = (): HTMLElement[] =>
    Array.from(list.querySelectorAll<HTMLElement>(config.itemSelector));

  const glueToPointer = (clientY: number): void => {
    if (!dragged) return;
    dragged.style.transition = "none";
    dragged.style.transform = "";
    const layoutTop = dragged.getBoundingClientRect().top;
    dragged.style.transform = `translateY(${clientY - grabOffset - layoutTop}px)`;
  };

  const slotFor = (clientY: number): HTMLElement | null => {
    if (!dragged) return null;
    const center = clientY - grabOffset + dragged.offsetHeight / 2;
    for (const el of items()) {
      if (el === dragged) continue;
      const box = el.getBoundingClientRect();
      if (center < box.top + box.height / 2) return el;
    }
    return null;
  };

  const reorder = (ref: HTMLElement | null): void => {
    if (!dragged) return;
    const others = items().filter((el) => el !== dragged);
    const firstTops = new Map(
      others.map((el) => [el, el.getBoundingClientRect().top] as const),
    );

    if (ref) list.insertBefore(dragged, ref);
    else list.appendChild(dragged);

    for (const el of others) {
      el.style.transition = "none";
      el.style.transform = "";
      const delta = (firstTops.get(el) ?? 0) - el.getBoundingClientRect().top;
      if (delta) el.style.transform = `translateY(${delta}px)`;
    }
    requestAnimationFrame(() => {
      for (const el of others) {
        if (!el.style.transform) continue;
        el.style.transition = `transform ${SETTLE_MS}ms ease`;
        el.style.transform = "";
      }
    });
  };

  const settle = (item: HTMLElement): void => {
    item.style.transition = `transform ${SETTLE_MS}ms ease`;
    item.style.transform = "";
    const finish = (): void => {
      item.classList.remove(ACTIVE_CLASS);
      clearTween(item);
    };
    item.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, SETTLE_MS + 40);
  };

  const onMove = (e: PointerEvent): void => {
    if (!dragged || e.pointerId !== pointerId) return;
    if (!active) {
      if (Math.abs(e.clientY - startY) < DRAG_THRESHOLD_PX) return;
      active = true;
      dragged.classList.add(ACTIVE_CLASS);
      list.classList.add(LIST_ACTIVE_CLASS);
    }
    e.preventDefault();
    reorder(slotFor(e.clientY));
    glueToPointer(e.clientY);
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    const item = dragged;
    const moved = active && item !== null;

    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    list.classList.remove(LIST_ACTIVE_CLASS);
    for (const el of items()) if (el !== item) clearTween(el);

    dragged = null;
    active = false;
    pointerId = -1;

    if (moved && item) {
      settle(item);
      config.onReorder(list, item);
    }
  };

  list.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.closest(config.handleSelector);
    if (!handle || !list.contains(handle)) return;
    const item = handle.closest<HTMLElement>(config.itemSelector);
    if (!item) return;

    e.preventDefault();
    dragged = item;
    pointerId = e.pointerId;
    startY = e.clientY;
    grabOffset = e.clientY - item.getBoundingClientRect().top;
    active = false;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  const moveByKey = (item: HTMLElement, direction: -1 | 1): void => {
    const siblings = items();
    const idx = siblings.indexOf(item);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    dragged = item;
    const ref =
      direction === -1
        ? siblings[swapIdx]
        : (siblings[swapIdx].nextElementSibling as HTMLElement | null);
    reorder(ref);
    dragged = null;

    settle(item);
    config.onReorder(list, item);
  };

  list.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const target = e.target as HTMLElement;
    const handle = target.closest(config.handleSelector);
    if (!handle || !list.contains(handle)) return;
    const item = handle.closest<HTMLElement>(config.itemSelector);
    if (!item) return;

    e.preventDefault();
    moveByKey(item, e.key === "ArrowUp" ? -1 : 1);
  });
};

declare global {
  interface Window {
    __degoogDrag?: {
      init: (list: HTMLElement, config: DragOrderConfig) => void;
    };
  }
}

if (typeof window !== "undefined") {
  window.__degoogDrag = { init: initDragOrder };
}
