export const OVERLAY_STATE_KEY = "degoogOverlay";
const SELF_POP_RESET_MS = 400;

interface OverlayHistoryState {
  [OVERLAY_STATE_KEY]: string;
}

type OverlayPopHandler = () => void;

const stack: string[] = [];
const handlers = new Map<string, OverlayPopHandler>();
let _selfPop = false;

const isOverlayState = (value: unknown): value is OverlayHistoryState =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Record<string, unknown>)[OVERLAY_STATE_KEY] === "string";

const _drop = (names: string[], skip?: string): void => {
  names.forEach((name) => {
    const handler = handlers.get(name);
    handlers.delete(name);
    if (name !== skip) handler?.();
  });
};

const _rewind = (count: number): void => {
  _selfPop = true;
  history.go(-count);
  setTimeout(() => {
    _selfPop = false;
  }, SELF_POP_RESET_MS);
};

export const popNamesToClose = (
  currentStack: string[],
  currentName: string | null,
): { toClose: string[]; nextStack: string[] } => {
  const nextStack = [...currentStack];
  const toClose: string[] = [];

  while (nextStack.length > 0 && nextStack[nextStack.length - 1] !== currentName) {
    const name = nextStack.pop();
    if (name === undefined) break;
    toClose.push(name);
  }

  return { toClose, nextStack };
};

export const openOverlay = (name: string, onPopClose: OverlayPopHandler): void => {
  handlers.set(name, onPopClose);
  stack.push(name);
  history.pushState({ [OVERLAY_STATE_KEY]: name }, "", location.href);
};

export const discardOverlay = (name: string): void => {
  const idx = stack.indexOf(name);
  if (idx === -1) return;

  _drop(stack.splice(idx), name);
};

export const closeOverlay = (name: string): void => {
  const idx = stack.indexOf(name);
  if (idx === -1) return;

  const removed = stack.splice(idx);
  _drop(removed, name);
  _rewind(removed.length);
};

export const onOverlayPop = (e: PopStateEvent): boolean => {
  if (_selfPop) {
    _selfPop = false;
    return true;
  }

  const hs = e.state as OverlayHistoryState | null;
  const currentName = isOverlayState(hs) ? hs[OVERLAY_STATE_KEY] : null;

  if (stack.length === 0) {
    if (currentName === null) return false;
    _rewind(1);
    return true;
  }

  const { toClose, nextStack } = popNamesToClose(stack, currentName);
  stack.length = 0;
  stack.push(...nextStack);
  _drop(toClose);

  return toClose.length > 0 || currentName !== null;
};
