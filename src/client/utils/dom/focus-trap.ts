const FOCUSABLE =
  "button, [href], input, select, textarea, summary, [tabindex]";

export const focusableIn = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("tabindex") !== "-1" &&
      el.getAttribute("type") !== "hidden" &&
      el.getClientRects().length > 0,
  );

export const wrapTab = (e: KeyboardEvent, root: HTMLElement): void => {
  if (e.key !== "Tab" || e.defaultPrevented) return;
  const focusable = focusableIn(root);
  const active = document.activeElement as HTMLElement | null;
  const inside = !!active && root.contains(active);
  if (focusable.length === 0) {
    e.preventDefault();
    if (!inside) root.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const atStart = active === first || active === root;
  if (e.shiftKey && (!inside || atStart)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || active === last)) {
    e.preventDefault();
    first.focus();
  }
};
