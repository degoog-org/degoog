import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { FakeElement, installFakeDom, serialize } from "../../helpers/fake-dom";
import { firstUnordered, placeByOrder } from "../../../src/client/modules/renderer/render-slots";
import { SlotPanel } from "../../../src/shared/ui/components/search/slot-panel";

let restore: () => void;

beforeAll(() => {
  restore = installFakeDom();
});

afterAll(() => {
  restore();
});

const place = (container: FakeElement, order: number, html = "panel"): void => {
  placeByOrder(
    container as unknown as Element,
    SlotPanel({ id: `p${order}`, html }),
    order,
  );
};

const slotIds = (container: FakeElement): (string | null)[] =>
  container.children.map((child) => child.getAttribute("data-slot"));

describe("placeByOrder", () => {
  test("panels land in registry order whatever order they arrive in", () => {
    for (const arrival of [[3, 0, 2, 1], [0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2]]) {
      const container = new FakeElement("div");
      for (const order of arrival) place(container, order);
      expect(slotIds(container)).toEqual(["p0", "p1", "p2", "p3"]);
    }
  });

  test("a panel for an order already on screen replaces it instead of doubling up", () => {
    const container = new FakeElement("div");
    place(container, 0, "old");
    place(container, 2);
    place(container, 0, "new");
    expect(slotIds(container)).toEqual(["p0", "p2"]);
    expect(serialize(container.children[0])).toContain("new");
  });

  test("ordered panels stay above whatever else the container already holds", () => {
    const container = new FakeElement("div");
    const stats = new FakeElement("div");
    stats.setAttribute("data-slot", "stats");
    container.appendChild(stats);
    place(container, 4);
    place(container, 1);
    expect(slotIds(container)).toEqual(["p1", "p4", "stats"]);
    expect(firstUnordered(container as unknown as Element)).toBe(stats as unknown as Element);
  });
});
