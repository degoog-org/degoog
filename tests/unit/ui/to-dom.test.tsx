import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  FakeElement,
  innerHtmlOf,
  installFakeDom,
} from "../../helpers/fake-dom";
import { append, clear, render } from "../../../src/shared/ui/tribute/dom";
import { RawDogIt } from "../../../src/shared/ui/tribute/rawdogit";
import { renderHtml } from "../../../src/shared/ui/tribute/html";
import type { VNode } from "../../../src/shared/ui/tribute/types";

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
    into(
      el,
      <ul>
        {[1, 2, 3].map((n) => (
          <li>{n}</li>
        ))}
      </ul>,
    );
    into(
      el,
      <ul>
        {[1].map((n) => (
          <li>{n}</li>
        ))}
      </ul>,
    );
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

  test("RawDogIt html is injected and left alone while unchanged", () => {
    const el = host();
    into(
      el,
      <div>
        <RawDogIt html="<b>plugin</b>" />
      </div>,
    );
    const wrapper = el.childNodes[0] as FakeElement;
    const b = wrapper.childNodes[0];

    into(
      el,
      <div>
        <RawDogIt html="<b>plugin</b>" />
      </div>,
    );
    expect(wrapper.childNodes[0]).toBe(b);

    into(
      el,
      <div>
        <RawDogIt html="<i>changed</i>" />
      </div>,
    );
    expect(innerHtmlOf(wrapper)).toBe("<i>changed</i>");
  });

  test("changing a raw block leaves the siblings after it in place", () => {
    const el = host();
    const tree = (html: string): VNode => (
      <div>
        <RawDogIt html={html} />
        <p>after</p>
      </div>
    );
    into(el, tree("<b>one</b>"));
    const wrapper = el.childNodes[0] as FakeElement;
    const after = wrapper.childNodes[1];
    const moved: unknown[] = [];
    const original = wrapper.insertBefore.bind(wrapper);
    wrapper.insertBefore = (node, anchor) => {
      moved.push(node);
      return original(node, anchor);
    };

    into(el, tree("<i>two</i>"));

    expect(innerHtmlOf(wrapper)).toBe("<i>two</i><p>after</p>");
    expect(wrapper.childNodes[1]).toBe(after);
    expect(moved).not.toContain(after);
  });
});

describe("render alongside direct DOM writes", () => {
  test("a raw innerHTML write between renders leaves no stale nodes behind", () => {
    const el = host();
    into(el, <p>first</p>);
    (el as unknown as { innerHTML: string }).innerHTML = "<span>outside</span>";

    into(el, <p>second</p>);

    expect(innerHtmlOf(el)).toBe("<p>second</p>");
  });

  test("clear empties the container and drops the cached tree", () => {
    const el = host();
    into(el, <p>first</p>);

    clear(el as unknown as Element);
    expect(innerHtmlOf(el)).toBe("");

    into(el, <p>second</p>);
    expect(innerHtmlOf(el)).toBe("<p>second</p>");
  });
});

describe("append", () => {
  test("adds nodes after existing children instead of replacing them", () => {
    const el = host();
    into(el, <p>kept</p>);
    append(<span>added</span>, el as unknown as Element);
    expect(innerHtmlOf(el)).toBe("<p>kept</p><span>added</span>");
  });

  test("produces the markup renderHtml would have produced", () => {
    const el = host();
    const node = (
      <div class="wrap" data-id="x">
        <b>bold</b>
        <RawDogIt html="<i>raw</i>" />
      </div>
    );
    append(node, el as unknown as Element);
    expect(innerHtmlOf(el)).toBe(renderHtml(node));
  });
});

describe("svg", () => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  test("creates svg and everything inside it in the svg namespace", () => {
    const el = host();
    into(
      el,
      <span>
        <svg viewBox="0 0 24 24">
          <path d="M0 0" />
          <circle r="3" />
        </svg>
      </span>,
    );
    const span = el.childNodes[0] as FakeElement;
    const svg = span.childNodes[0] as FakeElement;
    expect(span.namespaceURI).not.toBe(SVG_NS);
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect((svg.childNodes as FakeElement[]).map((c) => c.namespaceURI)).toEqual([SVG_NS, SVG_NS]);
    expect(innerHtmlOf(el)).toBe('<span><svg viewBox="0 0 24 24"><path d="M0 0"></path><circle r="3"></circle></svg></span>');
  });

  test("returns to html inside foreignObject", () => {
    const el = host();
    into(
      el,
      <svg>
        <foreignObject>
          <div>hi</div>
        </foreignObject>
      </svg>,
    );
    const svg = el.childNodes[0] as FakeElement;
    const foreign = svg.childNodes[0] as FakeElement;
    const div = foreign.childNodes[0] as FakeElement;
    expect(foreign.namespaceURI).toBe(SVG_NS);
    expect(div.namespaceURI).not.toBe(SVG_NS);
  });
});
