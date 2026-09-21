import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  FakeElement,
  innerHtmlOf,
  installFakeDom,
} from "../../helpers/fake-dom";
import { mount, render } from "../../../src/shared/ui/core/dom";
import { signal } from "../../../src/shared/ui/state/signal";
import { Raw } from "../../../src/shared/ui/core/raw";
import type { VNode } from "../../../src/shared/ui/core/types";

let restore: () => void;
beforeAll(() => {
  restore = installFakeDom();
});
afterAll(() => restore());

const host = (): FakeElement => new FakeElement("div");
const into = (el: FakeElement, node: VNode): void =>
  render(node, el as unknown as Element);

describe("render diffing", () => {
  test("renders an initial tree", () => {
    const el = host();
    into(el, <p class="a">hello</p>);
    expect(innerHtmlOf(el)).toBe('<p class="a">hello</p>');
  });

  test("updates text in place without replacing the element", () => {
    const el = host();
    into(el, <p>one</p>);
    const before = el.childNodes[0];

    into(el, <p>two</p>);
    expect(innerHtmlOf(el)).toBe("<p>two</p>");
    expect(el.childNodes[0]).toBe(before);
  });

  test("adds, changes and removes attributes", () => {
    const el = host();
    into(el, <p class="a" title="t" />);
    into(el, <p class="b" id="x" />);

    const p = el.childNodes[0] as FakeElement;
    expect(p.getAttribute("class")).toBe("b");
    expect(p.getAttribute("id")).toBe("x");
    expect(p.getAttribute("title")).toBeNull();
  });

  test("replaces the node when the tag changes", () => {
    const el = host();
    into(el, <p>x</p>);
    const before = el.childNodes[0];

    into(el, <div>x</div>);
    expect(innerHtmlOf(el)).toBe("<div>x</div>");
    expect(el.childNodes[0]).not.toBe(before);
  });

  test("keyed children are reordered, not rebuilt", () => {
    const el = host();
    const list = (order: string[]): VNode => (
      <ul>
        {order.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    );

    into(el, list(["a", "b", "c"]));
    const ul = el.childNodes[0] as FakeElement;
    const [a, b, c] = ul.childNodes;

    into(el, list(["c", "a", "b"]));
    expect(innerHtmlOf(ul)).toBe("<li>c</li><li>a</li><li>b</li>");
    expect(ul.childNodes[0]).toBe(c);
    expect(ul.childNodes[1]).toBe(a);
    expect(ul.childNodes[2]).toBe(b);
  });

  test("keyed removal keeps the surviving nodes", () => {
    const el = host();
    const list = (order: string[]): VNode => (
      <ul>
        {order.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    );

    into(el, list(["a", "b", "c"]));
    const ul = el.childNodes[0] as FakeElement;
    const a = ul.childNodes[0];

    into(el, list(["a", "c"]));
    expect(innerHtmlOf(ul)).toBe("<li>a</li><li>c</li>");
    expect(ul.childNodes[0]).toBe(a);
  });

  test("shrinking an unkeyed list removes the leftovers", () => {
    const el = host();
    into(el, <ul>{[1, 2, 3].map((n) => <li>{n}</li>)}</ul>);
    into(el, <ul>{[1].map((n) => <li>{n}</li>)}</ul>);
    expect(innerHtmlOf(el.childNodes[0] as FakeElement)).toBe("<li>1</li>");
  });

  test("event handlers bind, rebind and unbind", () => {
    const el = host();
    let hits = 0;
    const first = (): void => {
      hits += 1;
    };
    const second = (): void => {
      hits += 10;
    };

    into(el, <button onClick={first}>go</button>);
    const button = el.childNodes[0] as FakeElement;
    button.dispatch("click");
    expect(hits).toBe(1);

    into(el, <button onClick={second}>go</button>);
    button.dispatch("click");
    expect(hits).toBe(11);
    expect(button.listeners.length).toBe(1);

    into(el, <button>go</button>);
    button.dispatch("click");
    expect(hits).toBe(11);
    expect(button.listeners.length).toBe(0);
  });

  test("handlers are never written out as attributes", () => {
    const el = host();
    into(el, <button onClick={() => {}}>go</button>);
    expect(innerHtmlOf(el)).toBe("<button>go</button>");
  });

  test("a static subtree survives re-render untouched", () => {
    const el = host();
    into(
      el,
      <div static={true}>
        <span>original</span>
      </div>,
    );
    const wrapper = el.childNodes[0] as FakeElement;
    const injected = new FakeElement("em");
    wrapper.appendChild(injected);

    into(
      el,
      <div static={true}>
        <span>replaced</span>
      </div>,
    );

    expect(wrapper.childNodes).toContain(injected);
    expect(innerHtmlOf(wrapper)).toContain("original");
  });

  test("Raw html is injected and left alone while unchanged", () => {
    const el = host();
    into(el, <div><Raw html="<b>plugin</b>" /></div>);
    const wrapper = el.childNodes[0] as FakeElement;
    const b = wrapper.childNodes[0];

    into(el, <div><Raw html="<b>plugin</b>" /></div>);
    expect(wrapper.childNodes[0]).toBe(b);

    into(el, <div><Raw html="<i>changed</i>" /></div>);
    expect(innerHtmlOf(wrapper)).toBe("<i>changed</i>");
  });

  test("mount re-renders when a signal changes", () => {
    const el = host();
    const count = signal(0);
    const dispose = mount(
      () => <span>{count.value}</span>,
      el as unknown as Element,
    );

    expect(innerHtmlOf(el)).toBe("<span>0</span>");
    count.value = 5;
    expect(innerHtmlOf(el)).toBe("<span>5</span>");

    dispose();
    count.value = 9;
    expect(innerHtmlOf(el)).toBe("<span>5</span>");
  });
});
