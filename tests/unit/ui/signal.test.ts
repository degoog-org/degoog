import { describe, expect, test } from "bun:test";
import {
  batch,
  computed,
  effect,
  signal,
  untracked,
} from "../../../src/shared/ui/state/signal";

describe("signal", () => {
  test("effects run once up front and again on change", () => {
    const count = signal(0);
    const seen: number[] = [];
    effect(() => seen.push(count.value));

    count.value = 1;
    count.value = 2;

    expect(seen).toEqual([0, 1, 2]);
  });

  test("setting an equal value does not re-run effects", () => {
    const name = signal("a");
    let runs = 0;
    effect(() => {
      const _read = name.value;
      runs++;
    });

    name.value = "a";
    expect(runs).toBe(1);

    name.value = "b";
    expect(runs).toBe(2);
  });

  test("disposing stops further runs", () => {
    const count = signal(0);
    let runs = 0;
    const dispose = effect(() => {
      const _read = count.value;
      runs++;
    });

    dispose();
    count.value = 99;

    expect(runs).toBe(1);
  });

  test("dependencies are re-collected each run, so stale ones stop firing", () => {
    const toggle = signal(true);
    const left = signal("L");
    const right = signal("R");
    const seen: string[] = [];

    effect(() => seen.push(toggle.value ? left.value : right.value));
    expect(seen).toEqual(["L"]);

    toggle.value = false;
    expect(seen).toEqual(["L", "R"]);

    left.value = "L2";
    expect(seen).toEqual(["L", "R"]);

    right.value = "R2";
    expect(seen).toEqual(["L", "R", "R2"]);
  });

  test("batch coalesces writes into a single effect run", () => {
    const a = signal(1);
    const b = signal(2);
    let runs = 0;
    effect(() => {
      const _a = a.value;
      const _b = b.value;
      runs++;
    });

    batch(() => {
      a.value = 10;
      b.value = 20;
    });

    expect(runs).toBe(2);
  });

  test("computed derives and propagates", () => {
    const first = signal("ada");
    const shout = computed(() => first.value.toUpperCase());
    expect(shout.value).toBe("ADA");

    first.value = "grace";
    expect(shout.value).toBe("GRACE");
  });

  test("peek and untracked read without subscribing", () => {
    const count = signal(0);
    let runs = 0;
    effect(() => {
      const _peeked = count.peek();
      const _untracked = untracked(() => count.value);
      runs++;
    });

    count.value = 1;
    expect(runs).toBe(1);
  });
});
