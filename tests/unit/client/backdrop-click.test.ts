import { describe, expect, test } from "bun:test";
import { onBackdropClick } from "../../../src/shared/ui/components/overlay/shell";

type Listener = (e: MouseEvent) => void;

const fakeOverlay = () => {
  const listeners = new Map<string, Listener>();
  const overlay = {
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  } as unknown as HTMLElement;
  const fire = (type: string, target: unknown): void => {
    listeners.get(type)?.({ target } as unknown as MouseEvent);
  };
  return { overlay, listeners, fire };
};

const setup = () => {
  const { overlay, listeners, fire } = fakeOverlay();
  const inner = {};
  let closed = 0;
  const off = onBackdropClick(overlay, () => {
    closed += 1;
  });
  const gesture = (down: unknown, up: unknown, click: unknown): number => {
    fire("mousedown", down);
    fire("mouseup", up);
    fire("click", click);
    return closed;
  };
  return { overlay, inner, listeners, off, gesture };
};

describe("onBackdropClick", () => {
  test("closes when press, release and click all land on the backdrop", () => {
    const { overlay, gesture } = setup();
    expect(gesture(overlay, overlay, overlay)).toBe(1);
  });

  test("stays open when a drag starts inside the modal and ends on the backdrop", () => {
    const { overlay, inner, gesture } = setup();
    expect(gesture(inner, overlay, overlay)).toBe(0);
  });

  test("stays open when a press on the backdrop is released inside the modal", () => {
    const { overlay, inner, gesture } = setup();
    expect(gesture(overlay, inner, overlay)).toBe(0);
  });

  test("does not reuse a stale backdrop press for the next click", () => {
    const { overlay, inner, gesture } = setup();
    expect(gesture(overlay, inner, overlay)).toBe(0);
    expect(gesture(inner, overlay, overlay)).toBe(0);
  });

  test("detaches every listener on teardown", () => {
    const { listeners, off } = setup();
    expect(listeners.size).toBe(3);
    off();
    expect(listeners.size).toBe(0);
  });
});
