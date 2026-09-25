const SAME_TAB_TARGETS = ["", "_self", "_top", "_parent"];
const MIDDLE_CLICK = 1;

export const staysHere = (ev: MouseEvent, anchor: HTMLAnchorElement): boolean =>
  !ev.metaKey &&
  !ev.ctrlKey &&
  !ev.shiftKey &&
  !ev.altKey &&
  ev.button !== MIDDLE_CLICK &&
  !anchor.hasAttribute("download") &&
  SAME_TAB_TARGETS.includes(anchor.target);
