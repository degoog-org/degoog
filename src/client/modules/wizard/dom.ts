export type PopoverAnchor =
  | "auto"
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export const POPOVER_MARGIN = 12;
export const POPOVER_WIDTH = 320;
export const POPOVER_HEIGHT_GUESS = 180;
export const SCROLL_PADDING = 80;

interface Placement {
  top: number;
  left: number;
  arrow: "top" | "bottom" | "left" | "right" | "none";
  arrowOffset: number;
}

export const waitFor = (
  selector: string,
  timeoutMs = 1500,
): Promise<Element | null> =>
  new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const start = Date.now();
    const id = setInterval(() => {
      const el = document.querySelector(selector);
      if (el || Date.now() - start > timeoutMs) {
        clearInterval(id);
        resolve(el);
      }
    }, 60);
  });

export const buildRoot = (): HTMLElement => {
  const root = document.createElement("div");
  root.className = "degoog-wizard";
  root.innerHTML = `
    <div class="degoog-wizard__mask degoog-wizard__mask--top"></div>
    <div class="degoog-wizard__mask degoog-wizard__mask--right"></div>
    <div class="degoog-wizard__mask degoog-wizard__mask--bottom"></div>
    <div class="degoog-wizard__mask degoog-wizard__mask--left"></div>
    <div class="degoog-wizard__ring"></div>
    <div class="degoog-wizard__popover degoog-panel" role="dialog" aria-modal="true">
      <div class="degoog-wizard__progress"></div>
      <h2 class="degoog-wizard__title"></h2>
      <p class="degoog-wizard__body"></p>
      <a class="degoog-wizard__link" target="_blank" rel="noopener" hidden></a>
      <div class="degoog-wizard__hint" hidden></div>
      <div class="degoog-wizard__footer">
        <button type="button" class="degoog-btn degoog-wizard__skip"></button>
        <div class="degoog-wizard__nav">
          <button type="button" class="degoog-btn degoog-btn--secondary degoog-wizard__back"></button>
          <button type="button" class="degoog-btn degoog-btn--primary degoog-wizard__next"></button>
        </div>
      </div>
    </div>`;
  return root;
};

const computePlacement = (
  rect: DOMRect | null,
  vw: number,
  vh: number,
): Placement => {
  if (!rect) {
    return {
      top: vh / 2 - POPOVER_HEIGHT_GUESS / 2,
      left: vw / 2 - POPOVER_WIDTH / 2,
      arrow: "none",
      arrowOffset: 0,
    };
  }
  const spaceBelow = vh - rect.bottom;
  const spaceAbove = rect.top;
  const placeBelow =
    spaceBelow >= POPOVER_HEIGHT_GUESS + POPOVER_MARGIN ||
    spaceBelow >= spaceAbove;
  const top = placeBelow
    ? rect.bottom + POPOVER_MARGIN
    : rect.top - POPOVER_HEIGHT_GUESS - POPOVER_MARGIN;
  let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
  left = Math.max(
    POPOVER_MARGIN,
    Math.min(left, vw - POPOVER_WIDTH - POPOVER_MARGIN),
  );
  const arrowCenter = rect.left + rect.width / 2 - left;
  const arrowOffset = Math.max(20, Math.min(arrowCenter, POPOVER_WIDTH - 20));
  return {
    top: Math.max(
      POPOVER_MARGIN,
      Math.min(top, vh - POPOVER_HEIGHT_GUESS - POPOVER_MARGIN),
    ),
    left,
    arrow: placeBelow ? "top" : "bottom",
    arrowOffset,
  };
};

const resetPopoverPosition = (pop: HTMLElement): void => {
  pop.style.top = "";
  pop.style.left = "";
  pop.style.right = "";
  pop.style.bottom = "";
};

const applyAnchor = (pop: HTMLElement, anchor: PopoverAnchor): void => {
  const m = `${POPOVER_MARGIN * 2}px`;
  const vertical = anchor.startsWith("bottom") ? "bottom" : "top";
  const horizontal = anchor.endsWith("right") ? "right" : "left";
  pop.style[vertical] = m;
  pop.style[horizontal] = m;
};

export const setMaskRects = (
  root: HTMLElement,
  rect: DOMRect | null,
): void => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = root.querySelector<HTMLElement>(".degoog-wizard__mask--top");
  const right = root.querySelector<HTMLElement>(".degoog-wizard__mask--right");
  const bottom = root.querySelector<HTMLElement>(
    ".degoog-wizard__mask--bottom",
  );
  const left = root.querySelector<HTMLElement>(".degoog-wizard__mask--left");
  const ring = root.querySelector<HTMLElement>(".degoog-wizard__ring");
  if (!top || !right || !bottom || !left || !ring) return;
  if (!rect) {
    top.style.cssText = `top:0;left:0;width:100vw;height:100vh`;
    right.style.cssText = `display:none`;
    bottom.style.cssText = `display:none`;
    left.style.cssText = `display:none`;
    ring.style.display = "none";
    return;
  }
  const r = 6;
  const x = rect.left;
  const y = rect.top;
  const w = rect.width;
  const h = rect.height;
  top.style.cssText = `top:0;left:0;width:100vw;height:${Math.max(0, y - r)}px`;
  bottom.style.cssText = `top:${y + h + r}px;left:0;width:100vw;height:${Math.max(0, vh - (y + h + r))}px`;
  left.style.cssText = `top:${Math.max(0, y - r)}px;left:0;width:${Math.max(0, x - r)}px;height:${Math.min(vh, h + r * 2)}px`;
  right.style.cssText = `top:${Math.max(0, y - r)}px;left:${x + w + r}px;width:${Math.max(0, vw - (x + w + r))}px;height:${Math.min(vh, h + r * 2)}px`;
  ring.style.cssText = `top:${y - r}px;left:${x - r}px;width:${w + r * 2}px;height:${h + r * 2}px;display:block`;
};

export const placePopover = (
  root: HTMLElement,
  rect: DOMRect | null,
  anchor: PopoverAnchor = "auto",
): void => {
  const pop = root.querySelector<HTMLElement>(".degoog-wizard__popover");
  if (!pop) return;
  resetPopoverPosition(pop);
  if (anchor !== "auto") {
    pop.dataset.arrow = "none";
    pop.style.removeProperty("--arrow-offset");
    applyAnchor(pop, anchor);
    return;
  }
  const placement = computePlacement(
    rect,
    window.innerWidth,
    window.innerHeight,
  );
  pop.style.top = `${placement.top}px`;
  pop.style.left = `${placement.left}px`;
  pop.dataset.arrow = placement.arrow;
  pop.style.setProperty("--arrow-offset", `${placement.arrowOffset}px`);
};

export const ensureInView = async (el: Element): Promise<void> => {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top >= SCROLL_PADDING && r.bottom <= vh - SCROLL_PADDING) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  await new Promise((resolve) => setTimeout(resolve, 350));
};
