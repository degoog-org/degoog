type CompatClickHandler = (event: MouseEvent) => void;

interface CompatClickTarget {
  addEventListener(type: "click", handler: CompatClickHandler): void;
  removeEventListener(type: "click", handler: CompatClickHandler): void;
}

let _bound: { target: CompatClickTarget; handler: CompatClickHandler } | null = null;

export const bindCompatClicks = (
  target: CompatClickTarget,
  handler: CompatClickHandler,
): void => {
  if (_bound) _bound.target.removeEventListener("click", _bound.handler);
  _bound = { target, handler };
  target.addEventListener("click", handler);
};
