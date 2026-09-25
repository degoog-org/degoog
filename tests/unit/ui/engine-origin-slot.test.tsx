import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { FakeElement, installFakeDom } from "../../helpers/fake-dom";
import { render } from "../../../src/shared/ui/tribute/dom";
import { EngineOriginSlot } from "../../../src/client/utils/search/engine-stats/engine-origin-slot";
import type { EngineTiming } from "../../../src/shared/search-types";

let restore: () => void;
const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

beforeAll(() => {
  restore = installFakeDom();
  Object.defineProperty(globalThis, "window", {
    value: { scopedT: () => (key: string) => key },
    configurable: true,
    writable: true,
  });
});

afterAll(() => {
  restore();
  if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
  else delete (globalThis as { window?: unknown }).window;
});

const slots = (root: FakeElement): FakeElement[] => {
  const out: FakeElement[] = [];
  const walk = (el: FakeElement): void => {
    for (const child of el.childNodes) {
      if (!(child instanceof FakeElement)) continue;
      if (child.getAttribute("class") === "engine-origin") out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
};

const paint = (root: FakeElement, withIcon: Set<string>): void => {
  for (const slot of slots(root)) {
    const name = slot.getAttribute("data-engine") ?? "";
    if (slot.getAttribute("data-painted") !== null || !withIcon.has(name)) continue;
    const icon = new FakeElement("img");
    icon.setAttribute("alt", name);
    slot.appendChild(icon);
    slot.setAttribute("data-painted", "true");
  }
};

const iconsByEngine = (root: FakeElement): Record<string, string | null> =>
  Object.fromEntries(
    slots(root).map((slot) => {
      const icon = slot.childNodes.find((c): c is FakeElement => c instanceof FakeElement);
      return [slot.getAttribute("data-engine"), icon?.getAttribute("alt") ?? null];
    }),
  );

describe("engine origin icons survive re-renders", () => {
  test("a painted slot keeps its icon while keyed rows are re-rendered and reordered", () => {
    const host = new FakeElement("div");
    const rows = (names: string[]) => (
      <div>
        {names.map((name) => (
          <div key={name}>
            <EngineOriginSlot engineName={name} />
            {name}
          </div>
        ))}
      </div>
    );
    const icons = new Set(["Brave", "Bing"]);
    const step = (names: string[]): void => {
      render(rows(names), host as unknown as Element);
      paint(host, icons);
    };

    step(["Brave"]);
    step(["Brave", "Nasa", "Bing"]);
    step(["Nasa", "Bing", "Brave"]);
    step(["Brave", "Nasa", "Bing"]);

    expect(iconsByEngine(host)).toEqual({ Brave: "Brave", Nasa: null, Bing: "Bing" });
  });

  test("the engine stats panel keys its rows so an icon follows its engine", async () => {
    const { state } = await import("../../../src/client/state");
    const { EngineStatsPanel } = await import(
      "../../../src/client/modules/renderer/sidebar/engine-stats-panel"
    );
    const saved = state.displayEnginePerformance;
    state.displayEnginePerformance = true;
    try {
      const host = new FakeElement("div");
      const timing = (name: string): EngineTiming => ({ name, id: name.toLowerCase(), time: 1, resultCount: 1 });
      const step = (names: string[]): void => {
        render(EngineStatsPanel({ timings: names.map(timing) })!, host as unknown as Element);
        paint(host, new Set(["Brave"]));
      };

      step(["Brave"]);
      step(["Nasa", "Brave"]);
      step(["Brave", "Nasa"]);

      expect(iconsByEngine(host)).toEqual({ Brave: "Brave", Nasa: null });
    } finally {
      state.displayEnginePerformance = saved;
    }
  });
});
